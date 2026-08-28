param(
  [int]$MaxIters = 8
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $root "package.json"))) {
  $root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
}

Set-Location $root

$candidates = @(
  "Revisar debounce Realtime (INBOX_REALTIME_DEBOUNCE_MS) y select estrecho",
  "Comprobar virtualización ConversationList / ChatArea (overscan y measureElement)",
  "Lazy MetricsTab y path-import de iconos MUI",
  "Visibility refetch >30s y unmount de inbox fuera de inbox/commercial",
  "Optimistic send + clientRequestId + cache de media",
  "RPC crm_directory_meta_by_phones y useQuery de directory/metrics",
  "RLS (select auth.uid()) en políticas calientes",
  "AbortController al cambiar de chat en invoke de edges"
)

for ($i = 1; $i -le $MaxIters; $i++) {
  Write-Host "audit:loop iter $i / $MaxIters"
  node (Join-Path $root "scripts/audit/run.mjs")
  $code = $LASTEXITCODE
  node (Join-Path $root "scripts/audit/compare.mjs")
  $compare = $LASTEXITCODE
  if ($code -eq 0 -and $compare -eq 0) {
    Write-Host "audit:loop verde en iter $i"
    exit 0
  }
  $idx = [Math]::Min($i, $candidates.Count) - 1
  Write-Host "FALLÓ. Siguiente parche candidato: $($candidates[$idx])"
}

Write-Host "audit:loop agotó $MaxIters iteraciones"
exit 1
