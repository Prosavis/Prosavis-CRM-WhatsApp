/**
 * Despliega las 7 funciones wave-a leyendo _mcp-args-{name}.json.
 * Requiere SUPABASE_ACCESS_TOKEN o ejecutar desde entorno con MCP auth.
 * Uso preferido: agente llama deploy_edge_function (MCP) por cada función.
 *
 * Este script imprime el payload listo para MCP por función (stdout = JSON args).
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

const name = process.argv[2];
if (!name || !ORDER.includes(name)) {
  console.error('Uso: node deploy-wave-a-mcp-loop.mjs <function-name>');
  console.error('Nombres:', ORDER.join(', '));
  process.exit(1);
}

const file = path.join(deployDir, `_mcp-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(file, 'utf8'));
process.stdout.write(JSON.stringify(args));
