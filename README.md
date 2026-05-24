# system-design-lab

A long-running personal laboratory for backend & distributed systems practice. One evolving "developer platform" (API keys, events, rate limiting, webhooks, analytics) that's used to study real production failure modes: skip-locked queues, cache stampedes, retry storms, hot partitions, missing indexes, connection exhaustion.

The product is incidental. The infrastructure, scenarios, and observability are the deliverables.

See the build plan: `C:\Users\antho\.claude\plans\i-want-to-build-ancient-floyd.md`

## Stack

- **Node.js 22 / TypeScript** — pnpm workspaces
- **Express** — API service
- **Postgres 16** — primary store
- **Redis 7** — cache, rate limit, queue broker (later)
- **Kysely** — typed query builder, hand-written SQL migrations
- **Prometheus + Grafana** — metrics
- **k6** — load testing
- **pino** — structured logs

## Layout

```
apps/        api · worker · scheduler · admin-dashboard · load-tests
packages/    db · redis · queue · logger · metrics · shared
infra/       docker · compose · grafana · prometheus
docs/        architecture (ADRs) · incidents (post-mortems) · benchmarks
scenarios/   index of scenario branches
```

## Quick start

```bash
cp .env.example .env
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm dev:api
# in another terminal:
curl http://localhost:3000/healthz
```

Open Grafana at http://localhost:3001 (admin / admin).

## Phases

- **Phase 1** — vertical slice: api + db + custom Postgres queue + worker + scheduler + metrics + k6
- **Phase 2** — depth: token-bucket limiter (Lua), singleflight cache, webhook delivery, OpenTelemetry
- **Phase 3** — scenario branches (the point of the lab)
- **Phase 4** — admin dashboard, BullMQ migration, Loki, multi-instance

## Scenarios

See `scenarios/README.md` for the full catalog. Each scenario is a branch pair (`scenario/X` → `solution/X`) with a `docs/incidents/` post-mortem.
