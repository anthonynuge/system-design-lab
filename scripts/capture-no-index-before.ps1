# scripts/capture-no-index-before.ps1
#
# Captures the "before" artifacts for scenario/no-index:
#   - EXPLAIN ANALYZE output -> docs/benchmarks/no-index-explain-before.txt
#   - k6 summary             -> docs/benchmarks/no-index-before.json
#
# Run AFTER setup-no-index-caller.ps1 (which sets the env vars this needs).
# Assumes you are currently on branch scenario/no-index.
#
# Usage:  .\scripts\capture-no-index-before.ps1

$ErrorActionPreference = 'Stop'

if (-not $env:SEEDED_KEY_ID) { throw 'Run setup-no-index-caller.ps1 first.' }
if (-not $env:API_KEY)       { throw 'Run setup-no-index-caller.ps1 first.' }

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'scenario/no-index') {
    Write-Warning "Current branch is '$branch', expected 'scenario/no-index'."
    Write-Warning 'Continuing anyway, but the captured numbers should come from the broken state.'
}

New-Item -ItemType Directory -Path docs/benchmarks -Force | Out-Null

Write-Host '==> EXPLAIN ANALYZE (writing to docs/benchmarks/no-index-explain-before.txt)' -ForegroundColor Cyan
$explainSql = "EXPLAIN ANALYZE SELECT endpoint, status_code, created_at FROM requests WHERE api_key_id = '$env:SEEDED_KEY_ID' ORDER BY created_at DESC LIMIT 100;"
$explainOut = docker exec sdl-postgres psql -U sdl -d sdl -c $explainSql
$explainOut | Tee-Object -FilePath docs/benchmarks/no-index-explain-before.txt | Out-Null
Write-Host $explainOut

Write-Host ''
Write-Host '==> k6 burst (writing summary to docs/benchmarks/no-index-before.json)' -ForegroundColor Cyan
Write-Host '    runs for 30 seconds at 50 req/s...'
k6 run --summary-export=docs/benchmarks/no-index-before.json apps/load-tests/scripts/usage-burst.js

Write-Host ''
Write-Host '==> done. Artifacts:' -ForegroundColor Green
Get-ChildItem docs/benchmarks/no-index-*before* | Select-Object Name, Length, LastWriteTime

Write-Host ''
Write-Host 'Note your k6 numbers (p(95), total reqs, threshold pass/fail).' -ForegroundColor Yellow
Write-Host 'Then: git checkout solution/index-added && pnpm db:migrate' -ForegroundColor Yellow
Write-Host 'Then: .\scripts\capture-no-index-after.ps1' -ForegroundColor Yellow
