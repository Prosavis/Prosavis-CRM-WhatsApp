/**
 * Despliega las 7 funciones wave-a leyendo _mcp-call-{name}.json.
 * Escribe resultados en .edge-deploy/_deploy-results.json
 * Uso: node scripts/deploy-mcp-call-all.mjs
 *
 * Nota: este script prepara payloads; el agente debe invocar deploy_edge_function (MCP).
 * Para invocación directa desde Node sin MCP, usar deploy-wave-a-all-api.mjs con SUPABASE_ACCESS_TOKEN.
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

for (const name of ORDER) {
  const src = path.join(deployDir, `_mcp-call-${name}.json`);
  if (!fs.existsSync(src)) {
    console.error('Falta', src);
    process.exit(1);
  }
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  fs.writeFileSync(path.join(deployDir, '_current-mcp-args.json'), JSON.stringify(args));
  console.log(`PREPARED:${name}:${args.files.length}`);
}
