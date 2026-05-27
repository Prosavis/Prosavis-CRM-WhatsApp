<#
.SYNOPSIS
  Sincroniza secrets de Edge Functions desde .env.secrets.local a Supabase.
.DESCRIPTION
  Lee variables de .env.secrets.local y las pasa a `supabase secrets set`.
  Requiere `supabase` CLI autenticado y `SUPABASE_ACCESS_TOKEN` en el entorno.
.EXAMPLE
  .\scripts\set-supabase-secrets.ps1
#>

$secretsFile = Join-Path $PSScriptRoot ".." ".env.secrets.local"
if (-not (Test-Path $secretsFile)) {
  Write-Error "No se encuentra .env.secrets.local. Copie desde .env.secrets.local.example y complete valores."
  exit 1
}

$vars = @{}
Get-Content $secretsFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#")) {
    $eq = $line.IndexOf("=")
    if ($eq -gt 0) {
      $key = $line.Substring(0, $eq).Trim()
      $value = $line.Substring($eq + 1).Trim()
      if ($value -and $value -ne "") {
        $vars[$key] = $value
      }
    }
  }
}

if ($vars.Count -eq 0) {
  Write-Warning "No se encontraron variables en .env.secrets.local"
  exit 0
}

Write-Host "Configurando $($vars.Count) secrets en Supabase..." -ForegroundColor Cyan
$argsList = @()
foreach ($kv in $vars.GetEnumerator()) {
  $argsList += "$($kv.Key)=$($kv.Value)"
}

try {
  & npx supabase secrets set @argsList --project-ref djzwjaegxbhlefanmmee
  if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Secrets configurados correctamente" -ForegroundColor Green
  } else {
    Write-Error "Error al configurar secrets (exit code: $LASTEXITCODE)"
  }
} catch {
  Write-Error "Error: $_"
}
