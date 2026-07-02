# Despliega Edge Functions del CRM WhatsApp a Supabase remoto.
# Uso:
#   .\scripts\deploy-edge-functions.ps1
#   .\scripts\deploy-edge-functions.ps1 -Only discount-codes-admin,update-app-user-profile
# Requiere: npx supabase login y proyecto vinculado (djzwjaegxbhlefanmmee).

param(
  [string[]] $Only = @()
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ProjectRef = 'djzwjaegxbhlefanmmee'

$AllFunctions = @(
  'assign-whatsapp-tags',
  'block-whatsapp-user-admin',
  'bulk-whatsapp-send',
  'create-whatsapp-snippet',
  'create-whatsapp-sticker',
  'create-whatsapp-template-preset',
  'delete-whatsapp-conversation-admin',
  'delete-whatsapp-message-log-entry',
  'delete-whatsapp-snippet',
  'delete-whatsapp-tag',
  'delete-whatsapp-template-preset',
  'directory-ai-analyze',
  'directory-monitor',
  'discount-codes-admin',
  'ensure-whatsapp-conversation-from-lead',
  'get-prosavis-cleaning-wompi-checkout-url',
  'get-whatsapp-booking-context',
  'get-whatsapp-business-profile',
  'get-whatsapp-media-signed-url',
  'get-whatsapp-media-url',
  'get-whatsapp-metrics',
  'list-whatsapp-message-log',
  'list-whatsapp-message-templates',
  'list-whatsapp-snippets',
  'list-whatsapp-stickers',
  'list-whatsapp-template-presets',
  'log-whatsapp-outbound',
  'mark-whatsapp-as-read',
  'on-whatsapp-webhook',
  'patch-whatsapp-conversation',
  'purge-whatsapp-message-log',
  'reminder-automations-monitor',
  'send-appointment-confirmation',
  'send-appointment-reminder',
  'send-whatsapp-chat-message',
  'send-whatsapp-media-batch',
  'send-whatsapp-reaction',
  'send-whatsapp-template-message',
  'suggest-whatsapp-agent-reply',
  'sync-conversation-to-directory',
  'transcribe-whatsapp-inbound-audio',
  'update-app-user-profile',
  'update-whatsapp-business-profile',
  'update-whatsapp-snippet',
  'update-whatsapp-sticker',
  'update-whatsapp-tag',
  'update-whatsapp-template-preset'
)

$Targets = if ($Only.Count -gt 0) { $Only } else { $AllFunctions }

Write-Host "Desplegando $($Targets.Count) Edge Function(s) a proyecto $ProjectRef ..."

foreach ($fn in $Targets) {
  Write-Host "  -> $fn"
  npx supabase functions deploy $fn --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo deploy de $fn (exit $LASTEXITCODE)"
  }
}

Write-Host 'Deploy completado.'
Write-Host 'Secrets requeridos para discount-codes-admin: FIREBASE_SERVICE_ACCOUNT_JSON (compartido con update-app-user-profile / reminder-automations-monitor).'
