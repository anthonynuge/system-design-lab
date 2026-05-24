# Incident 0001 — `/v1/usage` p95 explodes on a moderately-loaded `requests` table

**Branch pair:** `scenario/no-index` ↔ `solution/index-added`
**Tag of origin:** `v3-api-surface`
**Status (scenario branch):** unmitigated by design

---

## 1. The symptom

`GET /v1/usage` returns correctly but slowly under sustained load. The k6 run against a `large` (1M-row `requests`) seed shows:

- `http_req_duration{p(95)}` climbs past 1 second (the threshold trips)
- API CPU is modest
- Postgres CPU dominates
- `pg_stat_activity` shows the same query repeatedly

## 2. Reproduce

```bash
# fresh start
docker compose -f infra/compose/docker-compose.yml down -v
pnpm infra:up
pnpm db:migrate
pnpm db:seed -- large    # ~30s, inserts 1M requests

# bootstrap a caller
pnpm dev:api &
USER=$(curl -s -X POST localhost:3000/v1/users \
    -H 'content-type: application/json' \
    -d '{"email":"incident0001@local"}')
USER_ID=$(echo "$USER" | jq -r .id)
KEY=$(curl -s -X POST localhost:3000/v1/api-keys \
    -H "Authorization: Bearer $USER_ID" | jq -r .key)

# Raise the rate limit (otherwise we measure 429s instead of latency)
RATE_LIMIT_MAX_REQUESTS=100000 pnpm dev:api
# or just edit .env, then restart

# run the burst
BASE_URL=http://localhost:3000 API_KEY=$KEY \
    k6 run --summary-export=docs/benchmarks/no-index-before.json \
    apps/load-tests/scripts/usage-burst.js
```

## 3. Diagnose — the EXPLAIN

```sql
EXPLAIN ANALYZE
  SELECT endpoint, status_code, latency_ms, request_id, created_at
  FROM requests
  WHERE api_key_id = '<the-api-key-id-you-created>'
  ORDER BY created_at DESC
  LIMIT 100;
```

Expected output **on `scenario/no-index`** (no composite index):

```
Limit  ...
  -> Sort  (Sort Method: top-N heapsort)
        Sort Key: created_at DESC
        -> Seq Scan on requests
              Filter: (api_key_id = '...'::uuid)
              Rows Removed by Filter: ~999000
```

Even at the small seed (1k rows) the seq scan is already visible — it's just instant because the data fits in shared_buffers. Scale to 1M rows and the same plan reads every block off disk.

## 4. Numbers (fill in your run)

|  | scenario/no-index | solution/index-added |
|---|---|---|
| EXPLAIN main plan node | Seq Scan + top-N heapsort | Index Scan Backward on the new composite |
| Buffers (shared hit/read) | _e.g. hit=8421 read=92_ | _e.g. hit=4 read=0_ |
| Single-query latency (psql `\timing`) | _e.g. 180ms_ | _e.g. 0.4ms_ |
| k6 `http_req_duration{p(95)}` | _e.g. 1340ms (THRESHOLD FAIL)_ | _e.g. 12ms_ |
| k6 `iterations` over 30s @ 50rps | _e.g. ~700 (rate dropping)_ | _1500 (full target)_ |
| Postgres CPU (Grafana) | _e.g. saturated_ | _e.g. <5%_ |

Save the k6 JSON to `docs/benchmarks/no-index-before.json` and `no-index-after.json`. Even rough numbers are fine — the point is to **internalize the ratio**, not produce a paper.

## 5. The fix (lives on `solution/index-added`)

A single migration:

```sql
-- 0006_requests_api_key_created_at_idx.sql
CREATE INDEX requests_api_key_created_at_idx
  ON requests (api_key_id, created_at DESC);
```

Why this column order and this direction:
- `api_key_id` first because it's the equality predicate.
- `created_at DESC` second because the query asks for the latest first; matching the index ordering lets Postgres satisfy `ORDER BY ... LIMIT N` with a backwards index scan, no Sort node.

In production you'd add `CREATE INDEX CONCURRENTLY` so it doesn't take an `ACCESS EXCLUSIVE` lock. Our migration runner wraps each file in a transaction, and `CONCURRENTLY` cannot run inside a transaction. That mismatch is itself a future scenario (`scenario/concurrent-index-migration`).

## 6. What this taught

- The query planner picks the cheapest plan from the indexes it's given. Without the right index, "ORDER BY ... LIMIT N" cannot avoid the full scan + sort.
- Seq scans **on small tables are fine** and even preferred. The bug isn't the plan — it's the missing index that lets a better plan exist.
- A single composite index almost always beats two separate single-column indexes for compound `WHERE x = ? ORDER BY y` queries.
- p95 in k6 and CPU in Grafana tell the same story from two sides. Train yourself to look at both.

## 7. Related scenarios to do next

- `scenario/bad-pagination`: even with the index, `OFFSET 999000` is slow. Keyset pagination on `(created_at, id)` is the fix.
- `scenario/hot-partition`: skewed traffic to one api_key makes the index's selectivity assumptions wrong.
- `scenario/concurrent-index-migration`: adding the index above to a live, write-heavy table without taking the write lock.
