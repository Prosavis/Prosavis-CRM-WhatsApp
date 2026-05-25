# Despliega todas las Edge Functions del repo al proyecto remoto.
# Requisito: `npx supabase login` o variable SUPABASE_ACCESS_TOKEN.
param(
  [string]$ProjectRef = "djzwjaegxbhlefanmmee"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$dirs = Get-ChildItem -Path "supabase\functions" -Directory |
  Where-Object { $_.Name -ne "_shared" } |
  Sort-Object Name

$names = $dirs | ForEach-Object { $_.Name }
Write-Host "Desplegando $($names.Count) funciones a $ProjectRef ..."

npx supabase functions deploy @names --project-ref $ProjectRef

Write-Host "Listo. Verifica en Dashboard > Edge Functions."
