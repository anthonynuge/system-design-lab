# @sdl/load-tests

k6 scripts for exercising the platform under load.

## Prerequisites

k6 is a separate binary. Install it once:
- **Windows:** `winget install k6.k6` or `choco install k6`
- **macOS:** `brew install k6`
- **Linux:** see https://k6.io/docs/get-started/installation/
- **Docker:** `docker run --rm -i --network host grafana/k6 run - <scripts/usage-burst.js`

Verify: `k6 version`

## Running

Most scripts expect `BASE_URL`, `API_KEY`, and sometimes `USER_ID` as env vars. Get them by:

```bash
# Boot the stack and api
pnpm infra:up
pnpm db:migrate
pnpm db:seed -- large    # 1M requests — needed for the index scenarios
pnpm dev:api

# In another shell, bootstrap a caller:
USER=$(curl -s -X POST localhost:3000/v1/users -d '{"email":"k6@local"}' -H 'content-type: application/json')
USER_ID=$(echo "$USER" | jq -r .id)
KEY=$(curl -s -X POST localhost:3000/v1/api-keys -H "Authorization: Bearer $USER_ID" | jq -r .key)

# Then run k6:
BASE_URL=http://localhost:3000 API_KEY=$KEY k6 run scripts/usage-burst.js
```

(PowerShell equivalents: `$env:API_KEY = ...; k6 run scripts/usage-burst.js`.)

## Scripts

| script | what it does | which scenario it exposes |
|---|---|---|
| `usage-burst.js` | Sustained 50 rps against `/v1/usage` for 30s | `scenario/no-index` — watch p95 in k6 output and DB CPU in Grafana |
| `usage-deep-offset.js` | Walks pagination from offset 0 to 999000 | `scenario/bad-pagination` — pagination cost grows linearly |

(More scripts land as more scenarios open.)

## Output

k6 prints a summary at the end (p50/p95/p99, throughput, error rate). Save runs you care about into `docs/benchmarks/` so before/after comparisons survive.

```bash
k6 run --summary-export=docs/benchmarks/no-index-before.json scripts/usage-burst.js
```
