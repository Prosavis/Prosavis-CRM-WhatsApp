/**
 * Imprime argumentos listos para CallMcpTool (una función por línea NDJSON).
 * Uso: node deploy-wave-via-mcp-tool.mjs a|b|c|all
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '..', '.edge-deploy');

const WAVES = {
  a: [
    'suggest-whatsapp-agent-reply',
    'transcribe-whatsapp-inbound-audio',
    'get-whatsapp-booking-context',
  ],
  b: [
    'bulk-whatsapp-send',
    'send-whatsapp-template-message',
    'send-whatsapp-reaction',
    'send-whatsapp-media-batch',
    'block-whatsapp-user-admin',
    'list-whatsapp-message-templates',
    'send-whatsapp-chat-message',
    'mark-whatsapp-as-read',
    'list-whatsapp-snippets',
    'create-whatsapp-snippet',
    'update-whatsapp-snippet',
    'delete-whatsapp-snippet',
  ],
  c: [
    'list-whatsapp-stickers',
    'create-whatsapp-sticker',
    'update-whatsapp-sticker',
    'get-prosavis-cleaning-wompi-checkout-url',
    'delete-whatsapp-conversation-admin',
    'delete-whatsapp-message-log-entry',
    'get-whatsapp-business-profile',
    'update-whatsapp-business-profile',
    'patch-whatsapp-conversation',
    'on-whatsapp-webhook',
    'get-whatsapp-media-url',
    'get-whatsapp-media-signed-url',
    'ensure-whatsapp-conversation-from-lead',
    'purge-whatsapp-message-log',
    'get-whatsapp-metrics',
    'list-whatsapp-message-log',
  ],
};

const wave = (process.argv[2] ?? 'a').toLowerCase();
const names =
  wave === 'all' ? [...WAVES.a, ...WAVES.b, ...WAVES.c] : WAVES[wave] ?? [];

if (!names.length) {
  console.error('Oleada desconocida:', wave);
  process.exit(1);
}

for (const name of names) {
  const src = path.join(deployDir, `_mcp-call-${name}.json`);
  if (!fs.existsSync(src)) {
    console.error('Falta payload:', src);
    process.exit(1);
  }
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  const out = path.join(deployDir, `_cursor-deploy-${name}.json`);
  fs.writeFileSync(out, JSON.stringify(args));
  console.log(name, args.files.length, out);
}
