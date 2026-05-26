/**
 * Despliega las 7 funciones wave-a leyendo _mcp-call-{name}.json.
 * Escribe _deploy-results.json con version o error por función.
 * Uso: node scripts/deploy-all-mcp-from-call-json.mjs
 *
 * NOTA: Este script solo valida payloads. El despliegue real lo hace
 * el agente vía CallMcpTool deploy_edge_function por cada función.
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

const manifest = [];
for (const name of ORDER) {
  const src = path.join(deployDir, `_mcp-call-${name}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  manifest.push({
    name,
    argsPath: src,
    fileCount: args.files.length,
    bytes: fs.statSync(src).size,
  });
}
fs.writeFileSync(path.join(deployDir, '_deploy-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
