# scripts/setup-no-index-caller.ps1
#
# Bootstraps a caller (user + api key) for the scenario/no-index walkthrough,
# captures a seeded api_key_id for EXPLAIN, and writes everything to env vars
# in the CURRENT shell so the rest of the walkthrough commands can use them.
#
# Usage:  . .\scripts\setup-no-index-caller.ps1
#         ^ note the leading dot-space: that's "dot-sourcing", which runs the
#         script in your current shell so $env: vars persist after it finishes.
#
# Prerequisites:
#   - docker compose is up (pnpm infra:up)
#   - migrations applied (pnpm db:migrate)
#   - large seed loaded (pnpm db:seed -- large)
#   - api running in another window (pnpm dev:api)

$ErrorActionPreference = 'Stop'

$BaseUrl = 'http://localhost:3000'

Write-Host '==> creating user...' -ForegroundColor Cyan
$randomEmail = "walkthrough-$(Get-Date -Format 'yyyyMMdd-HHmmss')@local"
$body = @{ email = $randomEmail } | ConvertTo-Json -Compress
$user = Invoke-RestMethod -Method POST -Uri "$BaseUrl/v1/users" `
    -ContentType 'application/json' -Body $body
Write-Host "    user_id  = $($user.id)"
Write-Host "    email    = $($user.email)"

Write-Host '==> creating api key...' -ForegroundColor Cyan
$keyResp = Invoke-RestMethod -Method POST -Uri "$BaseUrl/v1/api-keys" `
    -Headers @{ Authorization = "Bearer $($user.id)" }
Write-Host "    key_id   = $($keyResp.id)"
Write-Host "    api_key  = $($keyResp.key)"

Write-Host '==> looking up a seeded api_key (for EXPLAIN against real data)...' -ForegroundColor Cyan
$seededId = (docker exec sdl-postgres psql -U sdl -d sdl -t -A -c `
    "SELECT id FROM api_keys WHERE prefix LIKE 'sk_seed%' LIMIT 1;").Trim()
if (-not $seededId) {
    throw 'No seeded api_keys found. Did you run `pnpm db:seed -- large`?'
}
Write-Host "    seeded_key_id = $seededId"

# Export to the shell. Dot-sourcing this script keeps these alive after it returns.
$env:BASE_URL       = $BaseUrl
$env:API_KEY        = $keyResp.key
$env:API_KEY_ID     = $keyResp.id
$env:SEEDED_KEY_ID  = $seededId

Write-Host ''
Write-Host '==> sanity check: GET /v1/usage' -ForegroundColor Cyan
$check = Invoke-RestMethod -Uri "$env:BASE_URL/v1/usage?limit=3" `
    -Headers @{ Authorization = "Bearer $env:API_KEY" }
$check | ConvertTo-Json -Depth 4

Write-Host ''
Write-Host '==> ready. Env vars set in this shell:' -ForegroundColor Green
Write-Host "    `$env:BASE_URL       = $env:BASE_URL"
Write-Host "    `$env:API_KEY        = $env:API_KEY"
Write-Host "    `$env:API_KEY_ID     = $env:API_KEY_ID"
Write-Host "    `$env:SEEDED_KEY_ID  = $env:SEEDED_KEY_ID"
Write-Host ''
Write-Host 'Next: run .\scripts\capture-no-index-before.ps1' -ForegroundColor Yellow
