# scripts/

PowerShell helpers that exist purely so you don't have to copy-paste long commands out of chat.

Each script is short, idempotent where possible, and prints "what to do next" at the end.

## Walkthrough: scenario/no-index

```powershell
# Window A — leave it running
git checkout scenario/no-index
docker compose -f infra/compose/docker-compose.yml down -v
pnpm infra:up
pnpm db:migrate
pnpm db:seed -- large
pnpm dev:api

# Window B — paste these one at a time
. .\scripts\setup-no-index-caller.ps1     # NOTE the leading "dot space"
.\scripts\capture-no-index-before.ps1

git checkout solution/index-added
pnpm db:migrate
.\scripts\capture-no-index-after.ps1

# Compare files
notepad docs/benchmarks/no-index-explain-before.txt
notepad docs/benchmarks/no-index-explain-after.txt
notepad docs/incidents/0001-no-index.md
```

### Why the leading dot in `. .\scripts\setup-...`?

That's **dot-sourcing** — it runs the script in your current shell instead of a child shell. Without it, the `$env:API_KEY` etc. that the script sets would die the moment the script exits.

If you forget the dot, the script will still run, but the next script will complain that env vars are missing. Just re-run with the dot.

### Why three scripts and not one?

You need to switch branches between "before" and "after." A single script can't do that cleanly without confusing the working tree. Three scripts mirror the three phases.

## Adding more

When you build the next scenario (e.g. `no-idempotency`), follow the same pattern:
- `setup-no-idempotency-caller.ps1`
- `capture-no-idempotency-before.ps1`
- `capture-no-idempotency-after.ps1`

Or, if your next scenario doesn't need a special setup, just point at this README and tell future-you "follow the no-index pattern."
