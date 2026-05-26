/**
 * Lee wave-a-{name}.json y escribe el payload listo para deploy_edge_function (MCP).
 * Uso: node scripts/deploy-wave-a-from-json.mjs [function-name]
 * Sin argumentos: lista las 7 funciones wave-a en orden.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');

const WAVE_A_ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

function loadPayload(name) {
  const file = path.join(deployDir, `wave-a-${name}.json`);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    project_id: raw.project_id,
    name: raw.name,
    entrypoint_path: raw.entrypoint_path,
    verify_jwt: raw.verify_jwt,
    files: raw.files,
  };
}

const target = process.argv[2];
if (!target) {
  for (const name of WAVE_A_ORDER) {
    const p = loadPayload(name);
    console.log(`${name}\t${p.files.length} files\t${path.join(deployDir, `wave-a-${name}.json`)}`);
  }
  process.exit(0);
}

if (!WAVE_A_ORDER.includes(target)) {
  console.error(`Función desconocida: ${target}`);
  process.exit(1);
}

const out = path.join(deployDir, `_mcp-${target}.json`);
fs.writeFileSync(out, JSON.stringify(loadPayload(target)));
console.log(out);
