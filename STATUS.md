# STATUS — where the lab is right now

This file is the "you are here" pointer. It's updated at the end of every working session — both by the user and by any AI assistant. If you (or future-Claude) sit down and have no memory of this repo, read **this file first**, then `LAB.md` for the rules.

The other docs are reference: `LAB.md` (canonical workflow), `CLAUDE.md` (AI rules), `packages/db/README.md` (schema reasoning), `scenarios/README.md` (catalog index), `docs/incidents/*.md` (per-scenario post-mortems).

---

## Last session: 2026-05-24

### Tag roadmap progress

| tag | status | what it unlocks |
|---|---|---|
| `v0-foundation` | ✅ done | — |
| `v1-schema` | ✅ done | — |
| `v2-shared-packages` | ✅ done | — |
| `v3-api-surface` | ✅ done | `no-index`, `no-idempotency`, `rate-limiter-race`, `bad-pagination` |
| `v4-queue-system` | ⏳ next | queue scenarios (worker-double-processing, visibility-timeout, queue-backpressure) |
| `v5-webhooks` | future | retry-storm, circuit-breaker |
| `v6-observability-depth` | future | cache-stampede, connection-exhaustion |
| `v7-bullmq-migration` | future | — |
| `v8-multi-instance` | future | hot-partition |

### Scenario branches that exist on `origin`

| scenario | solution | docs | state |
|---|---|---|---|
| `scenario/no-index` | `solution/index-added` | `docs/incidents/0001-no-index.md` | reproducer + fix both pushed. **User has not yet captured large-seed numbers.** Section 4 of the incident doc has blanks waiting for `pnpm db:seed -- large` + k6 results. |

### Current branch

- `main` is at tag `v3-api-surface` (the merge commit).
- Working branches: none active. `feature/api-surface` was merged and deleted.

### Last completed work

PR #3 (`feature/api-surface`) merged → tag `v3-api-surface` pushed → `scenario/no-index` and `solution/index-added` created as a worked-example branch pair, both pushed to `origin`. Both contain `apps/load-tests/scripts/usage-burst.js`, the incident doc, and `scenarios/README.md`. The solution branch additionally contains migration `0006_requests_api_key_created_at_idx.sql` and the incident doc's §6b with captured EXPLAIN-plan-shape diffs.

---

## What to pick up next (in priority order)

### Option A — finish the v3 scenario family (≈ 1 weekend each, no new platform code)

Three sibling scenario/solution pairs still need to be created, same pattern as `no-index`:

1. **`scenario/no-idempotency` ↔ `solution/idempotency-key`**
   - Approach: flip `IDEMPOTENCY_ENABLED=false`, write k6 retry script with same `Idempotency-Key`, count duplicates in `requests`.
   - Solution branch: flip the env back; or, if more interesting, study the *race* that exists even with idempotency on (two simultaneous requests with the same key) and fix via row-level lock or PK retry.
   - Incident doc: `docs/incidents/0002-no-idempotency.md`.

2. **`scenario/rate-limiter-race` ↔ `solution/token-bucket-lua`**
   - Approach: k6 with 50 VUs all hitting the window-boundary instant; count how many pass the supposed cap of 60.
   - Solution branch: replace the naive `GET`+`INCR` with a Redis Lua script that does check-and-increment atomically.
   - Incident doc: `docs/incidents/0003-rate-limiter-race.md`.

3. **`scenario/bad-pagination` ↔ `solution/keyset-pagination`**
   - Approach: k6 sweeps `?offset=0` → `?offset=999000` against `/v1/usage` on the `large` seed; latency grows linearly.
   - Solution branch: add a `?cursor=<created_at>:<id>` keyset pagination path that's O(log N) regardless of depth.
   - Incident doc: `docs/incidents/0004-bad-pagination.md`.

Doing these in order also gives the user a chance to do `scenario/no-index` end-to-end on a `large` seed before moving on. The platform is unchanged across all four — only k6 scripts, migrations, and docs ship.

### Option B — start `feature/queue-system` toward tag `v4-queue-system`

Adds the custom Postgres-backed queue (SKIP LOCKED), `apps/worker`, `apps/scheduler`. Powers `worker-double-processing`, `visibility-timeout`, `queue-backpressure`. Bigger change, opens richer scenarios, but doesn't add learning over Option A until v3 scenarios are exercised.

**Recommended:** Option A first (especially actually running `scenario/no-index` to completion with real numbers), then Option B. The point of the lab is to *run* scenarios, not collect them.

### Option C — `docs/practice/` scaffolding

Per the earlier conversation about rebuilding middleware from scratch, scaffold `docs/practice/` with one-page specs for each rebuild exercise (auth, rate-limit, idempotency) so they're discoverable later. Low effort, high future value when the user wants to rebuild from a tag.

---

## How to update this file

At the end of any session that changes the repo's "state of play," update:
- **Tag roadmap** if a new tag was pushed
- **Scenario branches that exist** if a new scenario/solution pair was created
- **Current branch** to reflect where the working tree was left
- **Last completed work** with a one-paragraph summary
- **What to pick up next** so the next session has a clear starting line

Keep it under 200 lines. If "what's next" grows past 3 options, you're tracking too much — most belongs in a TODO or just gets done. This file is for orientation, not project management.
