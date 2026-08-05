# Ejecuta el worker de reactivaciones WhatsApp (dry-run o real) vía Edge Function.
#
# Uso:
#   .\scripts\run-reactivations.ps1 -DryRun -Limit 25
#   .\scripts\run-reactivations.ps1 -Real -Limit 25
#   .\scripts\run-reactivations.ps1 -Real   # sin tope
#
# Credenciales (en orden):
#   1) $env:REACTIVATION_API_KEY o $env:REMINDER_API_KEY
#   2) archivo .env.secrets.local / .env.local en la raíz del CRM
#   3) -ApiKey en la línea de comandos

param(
  [switch] $DryRun,
  [switch] $Real,
  [int] $Limit = 0,
  [string] $ApiKey = '',
  [string] $ProjectUrl = 'https://djzwjaegxbhlefanmmee.supabase.co'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

if (-not $DryRun -and -not $Real) {
  Write-Host 'Indica -DryRun o -Real.' -ForegroundColor Yellow
  exit 1
}
if ($DryRun -and $Real) {
  Write-Host 'Usa solo uno: -DryRun o -Real.' -ForegroundColor Yellow
  exit 1
}

function Read-EnvFileKey([string] $Path, [string] $Name) {
  if (-not (Test-Path $Path)) { return $null }
  foreach ($line in Get-Content $Path) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $k, $v = $line.Split('=', 2)
    if ($k.Trim() -eq $Name) { return $v.Trim().Trim('"').Trim("'") }
  }
  return $null
}

if (-not $ApiKey) {
  $ApiKey = $env:REACTIVATION_API_KEY
}
if (-not $ApiKey) {
  $ApiKey = $env:REMINDER_API_KEY
}
if (-not $ApiKey) {
  foreach ($name in @('REACTIVATION_API_KEY', 'REMINDER_API_KEY')) {
    $ApiKey = Read-EnvFileKey (Join-Path $Root '.env.secrets.local') $name
    if ($ApiKey) { break }
    $ApiKey = Read-EnvFileKey (Join-Path $Root '.env.local') $name
    if ($ApiKey) { break }
  }
}

if (-not $ApiKey) {
  Write-Host 'Falta REACTIVATION_API_KEY / REMINDER_API_KEY (env o -ApiKey).' -ForegroundColor Red
  exit 1
}

$body = @{
  dryRun = [bool]$DryRun
  schedulerName = 'run-reactivations.ps1'
  runKind = $(if ($DryRun) { 'dry_run' } else { 'manual' })
}
if ($Limit -gt 0) { $body.limit = $Limit }

$uri = "$ProjectUrl/functions/v1/run-whatsapp-reactivations"
Write-Host ("POST {0}  dryRun={1} limit={2}" -f $uri, $DryRun, $(if ($Limit -gt 0) { $Limit } else { '∞' }))

$json = $body | ConvertTo-Json -Compress
$resp = Invoke-RestMethod -Method Post -Uri $uri -Headers @{
  'x-api-key' = $ApiKey
  'Content-Type' = 'application/json'
} -Body $json

$resp | ConvertTo-Json -Depth 6
if (-not $resp.success) {
  Write-Host 'La función no devolvió success=true.' -ForegroundColor Red
  exit 2
}

Write-Host ''
Write-Host ('runId={0} dueCount={1}' -f $resp.runId, $resp.dueCount) -ForegroundColor Cyan
if ($resp.stats) {
  Write-Host ('stats: {0}' -f ($resp.stats | ConvertTo-Json -Compress)) -ForegroundColor Cyan
}
