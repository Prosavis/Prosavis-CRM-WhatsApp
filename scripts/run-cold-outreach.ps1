# Activación en frío (usuarios app) vía Edge Function run-app-user-cold-outreach.
# Sin UI React: preview / start / continue / retry por comando.
#
# Uso:
#   .\scripts\run-cold-outreach.ps1 -Preview
#   .\scripts\run-cold-outreach.ps1 -Preview -PilotLimit 25
#   .\scripts\run-cold-outreach.ps1 -Start -PilotLimit 25 -Confirm
#   .\scripts\run-cold-outreach.ps1 -Start -PilotLimit 250 -Confirm  # solo si el humano amplía el tope
#   .\scripts\run-cold-outreach.ps1 -Continue -JobId <uuid>
#   .\scripts\run-cold-outreach.ps1 -Retry -JobId <uuid>
#
# Política: siempre exigir -PilotLimit. Tope duro del script: 250
# (subir solo con instrucción explícita del humano).
#
# Auth: x-api-key = COLD_OUTREACH_API_KEY | REACTIVATION_API_KEY | REMINDER_API_KEY

param(
  [switch] $Preview,
  [switch] $Start,
  [switch] $Continue,
  [switch] $Retry,
  [switch] $Confirm,
  [int] $PilotLimit = 0,
  [string] $JobId = '',
  [string] $ApiKey = '',
  [string] $ProjectUrl = 'https://djzwjaegxbhlefanmmee.supabase.co'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ConfirmPhrase = 'CONFIRMAR_ACTIVACION_FRIO'

$modeCount = @($Preview, $Start, $Continue, $Retry).Where({ $_ }).Count
if ($modeCount -ne 1) {
  Write-Host 'Elige exactamente una acción: -Preview | -Start | -Continue | -Retry' -ForegroundColor Yellow
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
  foreach ($name in @('COLD_OUTREACH_API_KEY', 'REACTIVATION_API_KEY', 'REMINDER_API_KEY')) {
    $ApiKey = [Environment]::GetEnvironmentVariable($name)
    if ($ApiKey) { break }
  }
}
if (-not $ApiKey) {
  foreach ($name in @('COLD_OUTREACH_API_KEY', 'REACTIVATION_API_KEY', 'REMINDER_API_KEY')) {
    $ApiKey = Read-EnvFileKey (Join-Path $Root '.env.secrets.local') $name
    if ($ApiKey) { break }
    $ApiKey = Read-EnvFileKey (Join-Path $Root '.env.local') $name
    if ($ApiKey) { break }
  }
}
if (-not $ApiKey) {
  Write-Host 'Falta API key (COLD_OUTREACH_API_KEY / REACTIVATION_API_KEY / REMINDER_API_KEY).' -ForegroundColor Red
  exit 1
}

$body = @{}
if ($Preview) {
  $body.action = 'preview'
  if ($PilotLimit -gt 0) { $body.pilotLimit = $PilotLimit }
} elseif ($Start) {
  if (-not $Confirm) {
    Write-Host "Para enviar de verdad usa -Confirm (frase $ConfirmPhrase)." -ForegroundColor Yellow
    exit 1
  }
  if ($PilotLimit -le 0) {
    Write-Host 'Obligatorio -PilotLimit (política: 25 por lote). Ejemplo: -PilotLimit 25' -ForegroundColor Red
    exit 1
  }
  if ($PilotLimit -gt 250) {
    Write-Host "Tope máximo operativo: 250. Pediste $PilotLimit." -ForegroundColor Red
    exit 1
  }
  $body.action = 'start'
  $body.confirmation = $ConfirmPhrase
  $body.pilotLimit = $PilotLimit
} elseif ($Continue) {
  if (-not $JobId) { Write-Host 'JobId requerido.' -ForegroundColor Red; exit 1 }
  $body.action = 'continue'
  $body.jobId = $JobId
} else {
  if (-not $JobId) { Write-Host 'JobId requerido.' -ForegroundColor Red; exit 1 }
  $body.action = 'retry'
  $body.jobId = $JobId
}

$uri = "$ProjectUrl/functions/v1/run-app-user-cold-outreach"
Write-Host ("POST {0}  body={1}" -f $uri, ($body | ConvertTo-Json -Compress))

$resp = Invoke-RestMethod -Method Post -Uri $uri -Headers @{
  'x-api-key' = $ApiKey
  'Content-Type' = 'application/json'
} -Body ($body | ConvertTo-Json -Compress)

$resp | ConvertTo-Json -Depth 8
