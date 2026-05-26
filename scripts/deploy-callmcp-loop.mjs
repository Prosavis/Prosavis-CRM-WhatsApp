/**
 * Loop de despliegue: prepara _current-mcp-args.json por índice.
 * Uso: node scripts/deploy-callmcp-loop.mjs <index>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

const idx = Number(process.argv[2] ?? 0);
const name = ORDER[idx];
if (!name) {
  console.log(JSON.stringify({ done: true }));
  process.exit(0);
}

const src = path.join(deployDir, `_mcp-call-${name}.json`);
const args = JSON.parse(fs.readFileSync(src, 'utf8'));
fs.writeFileSync(path.join(deployDir, '_current-mcp-args.json'), JSON.stringify(args));
console.log(JSON.stringify({ index: idx, name, files: args.files.length }));
