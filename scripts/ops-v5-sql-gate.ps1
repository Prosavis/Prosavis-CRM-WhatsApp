#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Test-DockerEngine {
  try {
    docker info --format "{{.ServerVersion}}" 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

if (-not (Test-DockerEngine)) {
  Write-Host "Docker/Podman no esta corriendo. El gate SQL local necesita el engine."
  Write-Host "Instala Docker Desktop o Podman, reinicia, y vuelve a correr este script."
  Write-Host "Mientras tanto el gate vive en GitHub Actions: .github/workflows/ops-v5-sql-gate.yml"
  exit 2
}

npx --yes supabase@2.114.0 db start
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx --yes supabase@2.114.0 db reset --local --yes
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx --yes supabase@2.114.0 test db --local
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npx --yes supabase@2.114.0 db lint --local
exit $LASTEXITCODE
