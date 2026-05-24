# Scenarios — exhibit catalog

This directory is intentionally light: scenarios live as **branch pairs**, not as code in `main`. The branches stay forever. This file is the index that maps each catalog entry to its branches and tag of origin.

For the rules of how scenarios work, see `LAB.md` §4 (educational philosophy) and §7 (scenario catalog).

## How to run any scenario

```bash
# 1. Rewind to the tag the scenario was designed against
git checkout <scenario-branch>

# 2. Bring up the stack at whatever data scale the scenario needs
pnpm infra:up
pnpm db:migrate
pnpm db:seed -- <profile>      # small / medium / large

# 3. Run the k6 script the scenario branch ships with
pnpm dev:api                   # in one shell
# in another:
BASE_URL=http://localhost:3000 API_KEY=$KEY \
    k6 run apps/load-tests/scripts/<script>.js

# 4. Observe the symptom: k6 thresholds, Grafana panels, EXPLAIN ANALYZE
# 5. Read docs/incidents/<NNNN>-<slug>.md for the post-mortem

# 6. Switch to the solution branch and re-run the same k6 to see the fix
git checkout <solution-branch>
pnpm db:migrate
# re-run the k6, compare numbers
```

## Active scenarios

| scenario | solution | tag of origin | incident doc |
|---|---|---|---|
| `scenario/no-index` | `solution/index-added` | `v3-api-surface` | [`docs/incidents/0001-no-index.md`](../docs/incidents/0001-no-index.md) |

(more open as later tags ship: `no-idempotency`, `rate-limiter-race`, `bad-pagination`, then v4 unlocks the queue family)

## Conventions

- One scenario branch per concept. Pair it with one solution branch.
- Both branches forked from the same tag.
- Scenario branch ships: the k6 script (or whatever reproducer) + the incident doc with the "before" sections filled.
- Solution branch ships: the fix (migration, code, config) + the incident doc updated with "after" comparison.
- Never merge scenario or solution branches to `main`. They are reference exhibits, not features.
- Each branch's commit message should name the scenario explicitly and link the incident doc.
