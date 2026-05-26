# Carga secrets en Supabase desde .env.secrets.local (nunca commitear ese archivo).
param(
  [string]$ProjectRef = "djzwjaegxbhlefanmmee",
  [string]$EnvFile = ".env.secrets.local"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path $EnvFile)) {
  Write-Error "No existe $EnvFile. Copia .env.secrets.local.example y completa los valores."
}

$vars = @{}
Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $idx = $line.IndexOf("=")
  if ($idx -lt 1) { return }
  $key = $line.Substring(0, $idx).Trim()
  $value = $line.Substring($idx + 1).Trim()
  if ($value.StartsWith('"') -and $value.EndsWith('"')) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  $vars[$key] = $value
}

$required = @("NVIDIA_API_KEY")
foreach ($key in $required) {
  if (-not $vars[$key]) {
    Write-Error "Falta $key en $EnvFile"
  }
}

$secretKeys = @(
  "NVIDIA_API_KEY",
  "NVIDIA_MODEL_REPLY",
  "NVIDIA_MODEL_JSON",
  "NVIDIA_MODEL_TEMPLATE",
  "NVIDIA_MODEL_TRANSCRIBE",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "ENABLE_META_SEND",
  "WHATSAPP_WEBHOOK_MODE",
  "META_GRAPH_API_VERSION"
)

$cliArgs = @("secrets", "set", "--project-ref", $ProjectRef)
foreach ($key in $secretKeys) {
  if ($vars.ContainsKey($key) -and $vars[$key]) {
    $cliArgs += "${key}=$($vars[$key])"
  }
}

Write-Host "Configurando $($cliArgs.Count - 4) secrets en $ProjectRef ..."
npx supabase @cliArgs
Write-Host "Secrets aplicados."
