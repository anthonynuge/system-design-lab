# scripts/capture-no-index-after.ps1
#
# Captures the "after" artifacts for scenario/no-index:
#   - EXPLAIN ANALYZE output -> docs/benchmarks/no-index-explain-after.txt
#   - k6 summary             -> docs/benchmarks/no-index-after.json
#
# Run AFTER you have switched to solution/index-added and applied migration 0006.
# Reuses the env vars set by setup-no-index-caller.ps1.
#
# Usage:  .\scripts\capture-no-index-after.ps1

$ErrorActionPreference = 'Stop'

if (-not $env:SEEDED_KEY_ID) { throw 'Run setup-no-index-caller.ps1 first.' }
if (-not $env:API_KEY)       { throw 'Run setup-no-index-caller.ps1 first.' }

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'solution/index-added') {
    Write-Warning "Current branch is '$branch', expected 'solution/index-added'."
    Write-Warning 'Switch with: git checkout solution/index-added && pnpm db:migrate'
}

# Confirm the index exists; if not, the migration hasn't been applied.
$indexCheck = (docker exec sdl-postgres psql -U sdl -d sdl -t -A -c `
    "SELECT 1 FROM pg_indexes WHERE indexname = 'requests_api_key_created_at_idx';").Trim()
if (-not $indexCheck) {
    throw 'Index requests_api_key_created_at_idx is missing. Run: pnpm db:migrate'
}

New-Item -ItemType Directory -Path docs/benchmarks -Force | Out-Null

Write-Host '==> EXPLAIN ANALYZE (writing to docs/benchmarks/no-index-explain-after.txt)' -ForegroundColor Cyan
$explainSql = "EXPLAIN ANALYZE SELECT endpoint, status_code, created_at FROM requests WHERE api_key_id = '$env:SEEDED_KEY_ID' ORDER BY created_at DESC LIMIT 100;"
$explainOut = docker exec sdl-postgres psql -U sdl -d sdl -c $explainSql
$explainOut | Tee-Object -FilePath docs/benchmarks/no-index-explain-after.txt | Out-Null
Write-Host $explainOut

Write-Host ''
Write-Host '==> k6 burst (writing summary to docs/benchmarks/no-index-after.json)' -ForegroundColor Cyan
k6 run --summary-export=docs/benchmarks/no-index-after.json apps/load-tests/scripts/usage-burst.js

Write-Host ''
Write-Host '==> done. Artifacts:' -ForegroundColor Green
Get-ChildItem docs/benchmarks/no-index-* | Select-Object Name, Length, LastWriteTime

Write-Host ''
Write-Host 'Compare the two EXPLAIN files and the two k6 summaries side by side.' -ForegroundColor Yellow
Write-Host 'Then open docs/incidents/0001-no-index.md and fill in section 4 with real numbers.' -ForegroundColor Yellow
