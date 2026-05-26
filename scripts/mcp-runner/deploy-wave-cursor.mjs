/**
 * Lee _mcp-call-*.json y despliega vía Management API.
 * El token OAuth de Cursor MCP no está en shell; este script imprime
 * instrucciones o usa SUPABASE_ACCESS_TOKEN si existe.
 *
 * Para el agente: usar CallMcpTool deploy_edge_function con cada _mcp-call-{name}.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '..', '.edge-deploy');

const WAVE_A = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

for (const name of WAVE_A) {
  const p = path.join(deployDir, `_mcp-call-${name}.json`);
  console.log(JSON.stringify({ name, path: p, exists: fs.existsSync(p) }));
}
