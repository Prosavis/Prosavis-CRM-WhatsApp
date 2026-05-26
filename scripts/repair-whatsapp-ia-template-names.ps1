# Re-sincroniza nombres de plantillas IA desde Firestore (label -> name en Supabase).
param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$exportDir = Join-Path $PSScriptRoot "firebase-export"
Set-Location $exportDir

if (-not (Test-Path ".env")) {
  Write-Error "Falta scripts/firebase-export/.env (credenciales Firebase + Supabase)."
}

$args = @("migrate:export", "--", "--phase", "whatsapp", "--step", "ia_templates")
if ($DryRun) { $args += "--dry-run" }

Write-Host "Reparando whatsapp_ia_templates (paso ia_templates)..."
npm run @args
Write-Host "Listo."
