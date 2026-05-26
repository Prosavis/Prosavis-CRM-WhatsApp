/** Emite payload completo de _mcp-call-{name}.json a stdout para CallMcpTool. */
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
  console.error('Índice fuera de rango:', idx);
  process.exit(1);
}

const src = path.join(deployDir, `_mcp-call-${name}.json`);
process.stdout.write(fs.readFileSync(src, 'utf8'));
