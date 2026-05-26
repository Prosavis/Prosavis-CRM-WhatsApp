/**
 * Despliega las 7 funciones leyendo _mcp-call-{name}.json vía CallMcpTool (agent).
 * Imprime cada payload como una línea JSON en stdout para invocación MCP.
 * Uso: node scripts/deploy-callmcp-emit-args.mjs [function-name]
 * Sin argumento: emite los 7 payloads en orden (una línea por función).
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

const target = process.argv[2];
const names = target ? [target] : ORDER;

for (const name of names) {
  const src = path.join(deployDir, `_mcp-call-${name}.json`);
  if (!fs.existsSync(src)) {
    console.error(JSON.stringify({ name, error: `missing ${src}` }));
    continue;
  }
  process.stdout.write(fs.readFileSync(src, 'utf8'));
  if (!target) process.stdout.write('\n');
}
