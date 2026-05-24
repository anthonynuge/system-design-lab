# STATUS — where the lab is right now

This file is the "you are here" pointer. It's updated at the end of every working session — both by the user and by any AI assistant. If you (or future-Claude) sit down and have no memory of this repo, read **this file first**, then `LAB.md` for the rules.

The other docs are reference: `LAB.md` (canonical workflow), `CLAUDE.md` (AI rules), `packages/db/README.md` (schema reasoning), `scenarios/README.md` (catalog index), `docs/incidents/*.md` (per-scenario post-mortems), `docs/practice/README.md` (rebuild-from-scratch exercises — index only so far).

---

## Last updated: 2026-05-24

## Mode: PRACTICE — `scenario/no-index` run in progress, paused

The platform build is paused intentionally. v3 scenarios are exercisable and that's where the learning actually happens. **Do not start v4 work** until at least `scenario/no-index` has been run end-to-end with real numbers and a written incident doc. The repo's failure mode is "ship features, defer running them" — guard against it.

### Resume point — exactly where the user left off

Walkthrough so far:
- ✅ Window A: `docker compose down -v` → `pnpm infra:up` → `pnpm db:migrate` → `pnpm db:seed -- large` (1M `requests` rows loaded) → `pnpm dev:api`
- ✅ Window B: `. .\scripts\setup-no-index-caller.ps1` succeeded. Created a walkthrough user + api key, exported env vars, sanity-checked `/v1/usage`.

⚠ Env vars set in that Window B shell **die when the shell closes**. On resume, just re-run the setup script — it creates a fresh user/key each time, which is fine.

**Pick-up sequence when you return:**
1. If `pnpm dev:api` (Window A) isn't running anymore: `git checkout scenario/no-index` (or stay on whatever branch you're on — the api works on any v3+ branch) → `pnpm dev:api`. Docker volumes persisted; no need to re-seed.
2. **Fresh Window B:** `. .\scripts\setup-no-index-caller.ps1` (note the leading dot-space)
3. `.\scripts\capture-no-index-before.ps1` — EXPLAIN + k6, ~45s
4. `git checkout solution/index-added && pnpm db:migrate`
5. `.\scripts\capture-no-index-after.ps1` — same artifacts on the fixed state
6. Fill in `docs/incidents/0001-no-index.md` §4 with real numbers, commit, push
7. Update this file: flip the ❌ to ✅ in the scenario branches table below

---

## Tag roadmap progress

| tag | status | what it unlocks |
|---|---|---|
| `v0-foundation` | ✅ done | — |
| `v1-schema` | ✅ done | — |
| `v2-shared-packages` | ✅ done | — |
| `v3-api-surface` | ✅ done | `no-index`, `no-idempotency`, `rate-limiter-race`, `bad-pagination` |
| `v4-queue-system` | 🚫 BLOCKED on v3 scenarios being exercised | worker-double-processing, visibility-timeout, queue-backpressure |
| `v5-webhooks` | future | retry-storm, circuit-breaker |
| `v6-observability-depth` | future | cache-stampede, connection-exhaustion |
| `v7-bullmq-migration` | future | — |
| `v8-multi-instance` | future | hot-partition |

## Scenario branches that exist on `origin`

| scenario | solution | docs | exercised? |
|---|---|---|---|
| `scenario/no-index` | `solution/index-added` | `docs/incidents/0001-no-index.md` | ❌ **NOT YET** — reproducer + fix both pushed; §4 of incident doc has blanks waiting for `pnpm db:seed -- large` + k6 numbers |

## Current branch

- `main` is at the docs commit above `v3-api-surface`.
- Working branches: none active in-flight. User is about to check out `scenario/no-index` to start the practice loop.

## Last completed work (most recent first)

- Added `STATUS.md` and the `docs/practice/README.md` catalog index (the per-exercise spec files like `rate-limiter.md` are NOT yet written — deferred until after exercise #3 per agreed strategy).
- `CLAUDE.md` updated to instruct AI sessions to read `STATUS.md` first and to update it as part of any state-changing session.
- `scenario/no-index` + `solution/index-added` created as a worked-example branch pair off `v3-api-surface`. Both contain `apps/load-tests/scripts/usage-burst.js`, `docs/incidents/0001-no-index.md`, `scenarios/README.md`. Solution branch additionally contains migration `0006_requests_api_key_created_at_idx.sql` and the incident doc's §6b with captured EXPLAIN-plan-shape diffs.
- PR #3 (`feature/api-surface`) merged → tag `v3-api-surface` pushed.

---

## What to pick up next (in priority order)

### 1. RUN `scenario/no-index` end-to-end (this is the next thing — do it before anything else)

```powershell
git checkout scenario/no-index
docker compose -f infra/compose/docker-compose.yml down -v
pnpm infra:up && pnpm db:migrate && pnpm db:seed -- large
# raise rate limit in .env: RATE_LIMIT_MAX_REQUESTS=100000
pnpm dev:api
# in another shell, follow docs/incidents/0001-no-index.md §2:
#   - POST /v1/users, POST /v1/api-keys, capture $KEY
#   - psql: EXPLAIN ANALYZE the usage query, save the plan
#   - k6 run --summary-export=docs/benchmarks/no-index-before.json apps/load-tests/scripts/usage-burst.js

git checkout solution/index-added
pnpm db:migrate   # applies 0006
# re-run the same EXPLAIN and the same k6:
#   - k6 run --summary-export=docs/benchmarks/no-index-after.json apps/load-tests/scripts/usage-burst.js

# Fill in §4 of docs/incidents/0001-no-index.md on BOTH branches with your real numbers.
# Commit on each branch. Push.

# Update STATUS.md: mark scenario/no-index as exercised.
```

Estimated time: ~2 hours. The output is two filled-in benchmark JSONs, a complete incident doc, and the first real piece of evidence that the lab works.

### 2. Build the remaining three v3 scenario branches (same pattern as no-index, then exercise each)

In order: `scenario/no-idempotency`, `scenario/rate-limiter-race`, `scenario/bad-pagination`. Each is ~1 hour to scaffold + ~2 hours to run. **Do not scaffold all three then run them — scaffold one, run it, then scaffold the next.** That keeps the interleaved discipline.

Detailed approach for each:
- `no-idempotency`: flip `IDEMPOTENCY_ENABLED=false`, k6 retry script, count duplicate `requests` rows. Solution flips back; stretch: study the PK race that exists even with idempotency on, fix via row-lock or PK-retry.
- `rate-limiter-race`: 50 VUs hitting the window-boundary instant, count how many pass the cap of 60. Solution: Redis Lua script for atomic check-and-increment.
- `bad-pagination`: k6 sweeps `?offset=0` → `?offset=999000` on the `large` seed; latency grows linearly. Solution: `?cursor=<created_at>:<id>` keyset pagination.

### 3. ONLY after all four v3 scenarios are exercised: start `feature/queue-system` toward `v4-queue-system`

Adds the custom Postgres-backed queue (SKIP LOCKED), `apps/worker`, `apps/scheduler`. Powers worker-double-processing, visibility-timeout, queue-backpressure. **Don't start this until the v3 scenarios have real artifacts**, even if it's tempting.

### Deferred (do when the matching tag ships)

- `docs/practice/` per-exercise specs (rate-limiter.md, api-key-auth.md, idempotency.md). Index exists; specs deferred until after exercise #3 so they're informed by lived experience instead of guesses.
- A `practice-from-tag` skill (worktree-based "don't peek" enforcement). Build only if 3+ practice sessions reveal that markdown + honor-system isn't enough.

---

## How to update this file

At the end of any session that changes the repo's "state of play," update:
- **Last updated** to today's date
- **Mode** if it changed (build vs practice vs review)
- **Tag roadmap** if a new tag was pushed
- **Scenario branches that exist** if a new pair was created OR if an existing one got exercised (flip the ❌ to ✅ and link the benchmark JSONs)
- **Current branch** to reflect where the working tree was left
- **Last completed work** with a one-paragraph summary at the top of the list
- **What to pick up next** so the next session has a clear starting line

Keep it under 200 lines. If "what's next" grows past 3 options, you're tracking too much — most belongs in a TODO or just gets done. This file is for orientation, not project management.
