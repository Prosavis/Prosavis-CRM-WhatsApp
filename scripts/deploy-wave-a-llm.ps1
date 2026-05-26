# Oleada A: Edge Functions IA / NVIDIA NIM
param(
  [string]$ProjectRef = "djzwjaegxbhlefanmmee"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$functions = @(
  "suggest-whatsapp-agent-reply",
  "generate-whatsapp-ia-template",
  "transcribe-whatsapp-inbound-audio",
  "get-whatsapp-booking-context",
  "create-whatsapp-ia-template",
  "delete-whatsapp-ia-template",
  "resolve-whatsapp-ia-template"
)

Write-Host "Desplegando oleada A ($($functions.Count) funciones) a $ProjectRef ..."
npx supabase functions deploy @functions --project-ref $ProjectRef
Write-Host "Oleada A completada."
