/**
 * Loop de despliegue CallMcpTool: prepara payload y registra resultado.
 * Uso:
 *   node scripts/deploy-callmcp-sequential.mjs prepare <index>
 *   node scripts/deploy-callmcp-sequential.mjs record <name> <version|error> [error]
 *   node scripts/deploy-callmcp-sequential.mjs status
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

const mode = process.argv[2];
const outPath = path.join(deployDir, '_deploy-results.json');

function loadResults() {
  if (!fs.existsSync(outPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(outPath, 'utf8'));
  } catch {
    return [];
  }
}

function saveResults(results) {
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
}

if (mode === 'prepare') {
  const idx = Number(process.argv[3] ?? 0);
  const name = ORDER[idx];
  if (!name) {
    console.log(JSON.stringify({ done: true, order: ORDER }));
    process.exit(0);
  }
  const src = path.join(deployDir, `_mcp-call-${name}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  const out = path.join(deployDir, '_callmcp-args-only.json');
  fs.writeFileSync(
    out,
    JSON.stringify({
      project_id: args.project_id,
      name: args.name,
      entrypoint_path: args.entrypoint_path,
      verify_jwt: args.verify_jwt,
      files: args.files,
    }),
  );
  console.log(JSON.stringify({ index: idx, name, files: args.files.length, bytes: fs.statSync(out).size }));
  process.exit(0);
}

if (mode === 'record') {
  const name = process.argv[3];
  const value = process.argv[4];
  const isError = process.argv[5] === 'error';
  const results = loadResults();
  const entry = isError ? { name, error: value } : { name, version: Number(value) || value };
  const idx = results.findIndex((r) => r.name === name);
  if (idx >= 0) results[idx] = entry;
  else results.push(entry);
  saveResults(results);
  console.log(JSON.stringify(entry));
  process.exit(0);
}

if (mode === 'status') {
  console.log(JSON.stringify({ order: ORDER, results: loadResults() }, null, 2));
  process.exit(0);
}

console.error('Modos: prepare <index> | record <name> <value> [error] | status');
process.exit(1);
