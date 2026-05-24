# LAB.md — How to use this repository

This is the canonical document for what this repo is, how it's organized, and how you (and any AI assistant you work with here) should treat it. If anything below conflicts with day-to-day suggestions, **this document wins**.

---

## 1. What this is

A long-term **systems-engineering laboratory** disguised as a small backend platform. The product (a fake developer API with keys, events, rate limits, webhooks, analytics) is incidental. The real deliverables are:

- a runnable production-inspired backend on your laptop
- a git history full of **frozen save-states (tags)** you can rewind to
- a catalog of **intentionally broken branches (scenarios)** you can live with
- write-ups (`docs/incidents/`, `docs/benchmarks/`) that capture what you learned

It is NOT a deployable SaaS, not a resume project in the "I built X" sense, and not a tutorial collection. It is **your gym**.

---

## 2. How you use it (the five modes)

### Mode 1 — Rewind + rebuild a system yourself
```bash
git checkout v2-api
git checkout -b practice/rebuild-rate-limiter
# build it from scratch, compare to main when done
git diff main -- packages/redis/src/rate-limit/
```

### Mode 2 — Live with a production problem
```bash
git checkout scenario/cache-stampede
pnpm infra:up && pnpm dev:api && pnpm dev:worker
k6 run apps/load-tests/cache-stampede.js
# watch Grafana, read the matching docs/incidents/*.md
git checkout solution/singleflight-lock
# re-run, watch the fix
```

### Mode 3 — Compare architectures
```bash
git checkout v4-queue-system
k6 run apps/load-tests/queue-throughput.js   # → docs/benchmarks/
git checkout experiment/bullmq-swap
k6 run apps/load-tests/queue-throughput.js
# diff the JSON, write up the result
```

### Mode 4 — Explore the running infra
```bash
docker exec -it sdl-postgres psql -U sdl -d sdl
# EXPLAIN ANALYZE, \d table, watch Grafana while you poke
```

### Mode 5 — Add a new capability
```bash
git checkout main
git checkout -b feature/ip-rate-limit
# build, merge, tag if it's a milestone
```

---

## 3. Git workflow rules

### `main`
- Always represents the latest **stable** version of the platform.
- Must always boot (`pnpm infra:up && pnpm db:migrate && pnpm dev:api` → green).
- Never commit directly on `main` for non-trivial work — branch first.

### Tags = frozen learning checkpoints (the most important convention in this repo)
- Tags mark milestones you can **rewind to and rebuild from**.
- Tag immediately on the merge commit of a milestone branch.
- Format: `vN-shortname` (e.g. `v3-rate-limiter`).
- Tag message describes what's in this state AND what scenarios it unlocks.
- Roadmap of planned tags is in §6 below.

```bash
git tag -a v1-schema -m "Schema expansion: requests, idempotency, jobs, webhooks. Unlocks: scenario/no-index, scenario/no-idempotency."
git push origin v1-schema
```

### Branches

| prefix | purpose | examples |
|---|---|---|
| `feature/*` | new capability for `main` | `feature/rate-limiter`, `feature/webhook-delivery` |
| `scenario/*` | intentionally broken — a production problem you want to feel | `scenario/no-index`, `scenario/retry-storm`, `scenario/redis-down` |
| `solution/*` | the fix for a scenario; pairs 1:1 with a `scenario/*` branch | `solution/token-bucket`, `solution/skip-locked` |
| `experiment/*` | "what if we used X instead" — temporary, may never merge | `experiment/bullmq-swap`, `experiment/postgres-vs-clickhouse-analytics` |
| `benchmark/*` | pure perf work, results go in `docs/benchmarks/` | `benchmark/high-concurrency`, `benchmark/keyset-vs-offset` |
| `practice/*` | personal rebuild from a tag — do not push, or push to a private fork | `practice/rebuild-rate-limiter` |

### Branch lifecycle
- `feature/*` → merge → tag if milestone → delete branch
- `scenario/*` and `solution/*` → **keep forever**, do not delete; they are reference exhibits
- `experiment/*` → keep if interesting, document outcome, may merge or stay
- `benchmark/*` → results land in `docs/benchmarks/`, branch can be deleted after
- `practice/*` → personal, ephemeral

---

## 4. Educational philosophy

### Premature optimization is the enemy here
A normal codebase wants the best implementation. **This codebase wants implementations that have room to grow.** It is GOOD to leave:

- missing indexes
- naive algorithms (fixed-window before token bucket)
- incomplete retry protections
- bad pagination (OFFSET before keyset)
- race conditions in obvious places
- single instances of things that should be horizontally scaled later
- in-memory state where a Redis-backed version would be more correct

…**if and only if** each omission has a documented future scenario that exercises it.

### The rule: every intentional omission must be documented
When you (or Claude) leaves something suboptimal on purpose, the code must say so:

```sql
-- INTENTIONAL OMISSIONS (do not "fix" these without opening a scenario branch):
--   * NO composite index on (api_key_id, created_at DESC).
--     → scenario/no-index will add it and show p99 improvement.
```

If a piece of suboptimal code has no scenario hook, it's not "educational," it's just a bug. Fix it normally.

### What this means in practice
- When reviewing a change, ask: "Is this fix making `main` better, or is it removing a learning opportunity?"
- When adding a feature, ask: "What's the naive version? Can I ship the naive version on `main` and put the optimized version on a `solution/*` branch?"
- When something feels wrong but works: check `packages/db/README.md` and the migration comments. It may be wrong on purpose.

---

## 5. Weekly rhythm (the loop)

1. **Pick a concept** — "I want to understand SKIP LOCKED viscerally this weekend"
2. **Find your starting line** — which tag puts you at the right state? Which scenario branch reproduces the problem?
3. **Either rebuild from a tag, or live the problem from a scenario branch**
4. **Measure** with Grafana / k6 / EXPLAIN ANALYZE — collect numbers, not opinions
5. **Write 1 page** in `docs/incidents/` (post-mortem style) or `docs/benchmarks/` (numbers + chart)
6. **Commit, tag if milestone, push**

Two to four hours per session, repeatable forever, compounding.

The **write-up step (5) is the one most people skip**. It is the most valuable step. Skipping it converts the session into entertainment instead of training.

---

## 6. Tag roadmap

| tag | what's in it | unlocks scenarios |
|---|---|---|
| `v0-foundation` | compose stack, api skeleton, /healthz, /metrics | — |
| `v1-schema` | migrations 0002–0005, db README with scenario map | (nothing yet — no app code to break) |
| `v2-shared-packages` | logger, metrics, redis client, seed profiles (small/medium/large) | — |
| `v3-api-surface` | /v1/users, /v1/api-keys, /v1/events, /v1/usage; auth + rate-limit v1 + idempotency | `no-index`, `no-idempotency`, `rate-limiter-race`, `bad-pagination` |
| `v4-queue-system` | custom Postgres queue (SKIP LOCKED), worker, scheduler | `worker-double-processing`, `visibility-timeout`, `queue-backpressure` |
| `v5-webhooks` | outbound delivery, HMAC signing, retries, DLQ | `retry-storm`, `circuit-breaker` |
| `v6-observability-depth` | real Grafana dashboards, k6 catalog, OpenTelemetry traces | `cache-stampede`, `connection-exhaustion` |
| `v7-bullmq-migration` | (experiment-as-milestone) swap custom queue for BullMQ, write the comparison | — |
| `v8-multi-instance` | multiple api instances, nginx/traefik, consistent hashing for rate limits | `hot-partition` |

Tags after `v8` are TBD — the lab grows with your interests.

---

## 7. Scenario catalog (the long-term backlog)

Each row is an exhibit. When you build the matching tag, you can also build the scenario.

| scenario branch | solution branch | enabled at tag | what you'll see |
|---|---|---|---|
| `scenario/no-index` | `solution/index-added` | v3 | `/v1/usage` p99 spikes; EXPLAIN shows seq scan |
| `scenario/no-idempotency` | `solution/idempotency-key` | v3 | retry script creates duplicate writes |
| `scenario/rate-limiter-race` | `solution/token-bucket-lua` | v3 | naive `GET+INCR` lets bursts through |
| `scenario/bad-pagination` | `solution/keyset-pagination` | v3 | `OFFSET 1000000` vs keyset |
| `scenario/worker-double-processing` | `solution/skip-locked` | v4 | two workers pick the same job |
| `scenario/visibility-timeout` | `solution/janitor-sweep` | v4 | worker dies mid-job, row stuck `running` |
| `scenario/queue-backpressure` | `solution/bounded-queue` | v4 | producer outpaces consumer, unbounded growth |
| `scenario/retry-storm` | `solution/backoff-jitter` | v5 | synchronized retries thundering-herd downstream |
| `scenario/circuit-breaker` | `solution/breaker-state` | v5 | perma-failing webhook eats worker capacity |
| `scenario/cache-stampede` | `solution/singleflight-lock` | v6 | cache expiry under load hits DB hard |
| `scenario/connection-exhaustion` | `solution/pgbouncer` | v6 | long transactions drain pool |
| `scenario/redis-down` | `solution/redis-degraded-mode` | v6 | `docker stop sdl-redis` shouldn't kill the api |
| `scenario/hot-partition` | `solution/key-hashing` | v8 | one tenant takes 90% of traffic |

When you implement one, append the matching `docs/incidents/NNNN-<slug>.md`.

---

## 8. When working with Claude (or any AI assistant) in this repo

These rules exist so the assistant doesn't accidentally undo the lab's purpose.

**Always-on rules:**
1. Read this file (`LAB.md`) before suggesting any change.
2. Never "fix" something that has an `INTENTIONAL OMISSIONS` comment without explicit instruction.
3. Every milestone proposal must include: branch name, tag name on merge, intentional omissions, scenario branches it unlocks.
4. Prefer the **naive** implementation on `main`. The optimized version lives on a `solution/*` branch.
5. When adding code, ask: "What's the future scenario where this becomes wrong?" and document it.
6. When removing a bottleneck, check the scenario catalog (§7). If a scenario relies on the bottleneck, do not remove it; suggest a scenario branch instead.
7. Suggest tag points proactively. Suggest scenario branches proactively. Suggest write-up topics proactively.
8. Never commit on `main` for non-trivial work. Branch first.
9. Commits should be in the user's voice; no AI-attribution co-author trailers unless explicitly requested.
10. When something is genuinely a bug (not an intentional omission), fix it normally.

**Workflow expectations:**
- For each new milestone, the assistant should open a `feature/*` branch, do the work, prepare it for merge, and propose the tag name and tag message.
- After merge, the assistant should suggest which scenario branches are now possible from this state.

---

## 9. Quick commands cheatsheet

```bash
# infra
pnpm infra:up                          # start postgres, redis, prometheus, grafana
pnpm infra:down                        # stop (data persists in volumes)
docker compose -f infra/compose/docker-compose.yml down -v   # nuke volumes

# database
pnpm db:migrate                        # apply pending migrations
pnpm db:seed                           # seed with default profile (small)
pnpm db:seed -- medium                 # 100k requests
pnpm db:seed -- large                  # 1M requests (needed for no-index scenario)

# services
pnpm dev:api                           # api on :3000
pnpm dev:worker                        # worker on :3100  (post-v4)
pnpm dev:scheduler                     # scheduler on :3200 (post-v4)

# observability
# http://localhost:3001  Grafana (admin / admin)
# http://localhost:9090  Prometheus  (Status → Targets to verify scrape)
# http://localhost:3000/metrics  raw api metrics

# database introspection
docker exec -it sdl-postgres psql -U sdl -d sdl
# inside psql:  \dt   \d <table>   \di   EXPLAIN ANALYZE ...

# git workflow
git tag -a vN-name -m "what this state contains; what it unlocks"
git push origin vN-name
git checkout -b feature/foo            # new capability
git checkout -b scenario/bar           # intentionally broken
git checkout -b solution/bar           # the fix for scenario/bar
git checkout vN-name && git checkout -b practice/rebuild-foo  # rewind & rebuild
```

---

## 10. The one-line version

> Build a small platform. Tag every milestone. Break it on purpose. Fix it. Write down what you learned. Repeat for years.
