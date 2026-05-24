# @sdl/db

The data layer. Kysely client, a hand-rolled migration runner, and the SQL schema for the entire platform.

## Why hand-written SQL migrations

This lab is about learning Postgres. Prisma and similar tools generate migrations for you, which means you never read the SQL, never think about indexes, and never see the difference between `CREATE INDEX` and `CREATE INDEX CONCURRENTLY`. We write every migration by hand in `migrations/NNNN_name.sql` and the runner just applies them in order inside a transaction.

## Running

```bash
pnpm db:migrate   # apply pending migrations
pnpm db:seed      # populate test data (see Seed profiles below)
```

The runner tracks state in a `_migrations` table. Each file runs in a transaction. If a file fails it rolls back and the runner exits non-zero.

## Schema

### `users`
The account that owns API keys and webhooks.

| column | notes |
|---|---|
| `id` (uuid PK) | `gen_random_uuid()` from `pgcrypto` |
| `email` (unique) | bootstrap field; real auth comes later |
| `created_at` | |

No scenario hooks here — it's just the parent for FKs.

### `api_keys`
The thing a client sends in `Authorization: Bearer sk_live_...`.

| column | notes |
|---|---|
| `id` (uuid PK) | |
| `user_id` (FK → users) | cascade delete |
| `prefix` (text) | first few chars of the key, plaintext, **indexed** so we can find the row by prefix and only hash-compare one row |
| `key_hash` (text, unique) | SHA-256 of the full key; we never store the key itself |
| `created_at` | |
| `revoked_at` | nullable; revoked keys are not deleted, so audit history survives |

**Indexes:** `api_keys_prefix_idx (prefix)`.

**Scenarios this enables later:** none directly. But the hash-compare pattern matters for the auth-perf branch (timing attacks, constant-time compare).

### `requests`
Append-only event log. Every authenticated `/v1/*` call writes one row.

| column | notes |
|---|---|
| `id` (bigserial PK) | high write volume; bigint to avoid running out |
| `api_key_id` (FK → api_keys) | |
| `endpoint` | e.g. `POST /v1/events` |
| `status_code`, `latency_ms` | |
| `request_id` | the `X-Request-ID` header — **indexed** for incident grep |
| `created_at` | |

**Indexes:** `requests_request_id_idx (request_id)` only.

**Intentionally missing:** composite `(api_key_id, created_at DESC)`. `GET /v1/usage` will need this. Without it, EXPLAIN will show a Seq Scan + Sort on a multi-million-row table.

| scenario | what you'll observe |
|---|---|
| `scenario/no-index` → `solution/index-added` | `/v1/usage` p99 spikes after the seed loads 1M rows. EXPLAIN shows seq scan. Add the composite index; p99 drops by 100×. |
| `scenario/bad-pagination` → `solution/keyset-pagination` | `?offset=1000000` vs keyset on `(created_at, id)`. Benchmark both. |
| `scenario/hot-partition` (later) | Skew the seed so one `api_key_id` owns 90% of rows; observe planner choice. |

### `idempotency_keys`
Replay cache for `POST /v1/events` requests carrying an `Idempotency-Key` header.

| column | notes |
|---|---|
| `(api_key_id, key)` PK | the key is scoped per-tenant |
| `request_fingerprint` | sha256(method + path + body). Mismatch → 409, not silent replay. |
| `status_code`, `response_body` | what we replay |
| `created_at` | for the future TTL prune |

**Indexes:** PK + `idempotency_keys_created_at_idx`.

**Intentionally missing:** no TTL job, no row count cap.

| scenario | what you'll observe |
|---|---|
| `scenario/no-idempotency` → `solution/idempotency-key` | k6 retry script causes duplicate writes when middleware is disabled. Re-enable it to see the dupes vanish. |
| `scenario/idempotency-bloat` (later) | Run for a day, watch table size grow without bound. Add the prune job. |

### `jobs`
Backing table for the custom Postgres-backed queue (built in PR 4).

| column | notes |
|---|---|
| `id` (bigserial PK) | |
| `type` (text) | dispatch key — handler registered by name |
| `payload` (jsonb) | |
| `status` (text + CHECK) | `pending` / `running` / `completed` / `dead`. Plain text + CHECK > enum because enums are painful to alter. |
| `attempts`, `max_attempts` | |
| `run_at` | when the row becomes pollable; bumped on retry for backoff |
| `locked_at`, `locked_by` | set when a worker claims the row |
| `last_error` | tail of the stack trace from the most recent failure |
| `request_id` | propagated from the enqueueing HTTP request for tracing |
| `created_at`, `updated_at` | |

**Indexes:**
- `jobs_pending_run_at_idx (run_at) WHERE status = 'pending'` — the partial index the SKIP LOCKED poller hits. Stays small because most rows end up `completed` or `dead`.
- `jobs_type_status_idx (type, status)` — admin dashboard queries.

**Intentionally missing:**
- No dedupe constraint on `(type, payload_fingerprint)`.
- No index on `locked_at`.

| scenario | what you'll observe |
|---|---|
| `scenario/worker-double-processing` → `solution/skip-locked` | Run two workers without `FOR UPDATE SKIP LOCKED`. Both pick the same row. Add SKIP LOCKED; duplicates stop. |
| `scenario/visibility-timeout` | Kill a worker mid-job. Row stays `running` forever. Build a janitor — but its sweep is slow without an index on `locked_at`. Add it. |
| `scenario/queue-backpressure` → `solution/bounded-queue` | Producer outpaces consumer; row count climbs unbounded. Cap with a bounded-queue check at enqueue time + return 429. |

### `webhooks`
User-registered outbound URL.

| column | notes |
|---|---|
| `id` (uuid PK) | |
| `user_id` (FK) | cascade |
| `url`, `secret` | secret is the HMAC signing key |
| `enabled` | soft-disable for failing endpoints |
| `created_at` | |

**Indexes:** `webhooks_user_id_idx`.

### `webhook_deliveries`
One row per delivery attempt batch (rows are updated in place, not re-inserted per attempt).

| column | notes |
|---|---|
| `id` (bigserial PK) | |
| `webhook_id` (FK) | |
| `event_type`, `payload` | |
| `status` (CHECK) | `pending` / `delivered` / `failed` / `dead` |
| `attempts`, `max_attempts` | |
| `next_attempt_at` | bumped on retry; the partial index targets this |
| `last_status_code`, `last_response`, `last_error` | for the admin "why did this fail" view |
| `request_id` | trace correlation |

**Indexes:**
- `webhook_deliveries_pending_idx (next_attempt_at) WHERE status = 'pending'` — same partial-index pattern as jobs.
- `webhook_deliveries_webhook_status_idx (webhook_id, status)` — admin queries.

**Intentionally missing:** no jitter column, no circuit-breaker state on `webhooks`, no HMAC version column.

| scenario | what you'll observe |
|---|---|
| `scenario/retry-storm` → `solution/backoff-jitter` | Make 10 webhooks point at a 500-ing endpoint. All retry on the same backoff schedule → synchronized thundering herd hitting the endpoint. Add jitter; herd flattens. |
| `scenario/circuit-breaker` | A perma-failing webhook eats worker capacity until `max_attempts`. Add `consecutive_failures` + `circuit_open_until` to `webhooks` and short-circuit dispatch. |

## Seed profiles

`pnpm db:seed [profile]` where profile is one of:

| profile | users | api_keys | requests | use case |
|---|---|---|---|---|
| `small` (default) | 2 | 2 | 1 000 | dev iteration; queries finish instantly |
| `medium` | 10 | 50 | 100 000 | k6 smoke runs, dashboards look real |
| `large` | 20 | 200 | 1 000 000 | for scenario/no-index — without this many rows the missing-index symptom isn't visible |

The seed uses `generate_series` for `requests` so it's fast even at 1M rows (~30s). It's idempotent: if `users` is already populated, it bails out. Drop the volume (`docker compose down -v`) to reset.

## Conventions

- File names are zero-padded sequence + snake-case description: `0007_add_webhook_jitter.sql`.
- Never edit a migration that has been committed. Write a new one.
- Indexes that the app **needs to function** go in the same migration as the table. Indexes that are "performance fixes" for a scenario branch go in their own migration on the solution branch.
- Use `CREATE INDEX CONCURRENTLY` in solution branches when teaching the concurrent-index lesson — but be aware our runner wraps each file in a transaction, and `CONCURRENTLY` can't run inside one. There's a future migration-runner upgrade scenario in that.
