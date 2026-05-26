/**
 * Despliega las 7 funciones leyendo _mcp-call-{name}.json.
 * Emite _deploy-results.json con {name, version|error} por función.
 * Requiere que el agente invoque CallMcpTool deploy_edge_function por cada
 * _callmcp-ready-{name}.json generado (payload completo con _shared).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '..', '.edge-deploy');

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

const mode = process.argv[2] ?? 'prepare';
const resultArg = process.argv[3];

if (mode === 'prepare') {
  for (const name of ORDER) {
    const src = path.join(deployDir, `_mcp-call-${name}.json`);
    const args = JSON.parse(fs.readFileSync(src, 'utf8'));
    const out = path.join(deployDir, `_callmcp-ready-${name}.json`);
    fs.writeFileSync(out, JSON.stringify(args));
    process.stderr.write(`Prepared ${name}: ${args.files.length} files\n`);
  }
  console.log(JSON.stringify({ prepared: ORDER.length }));
} else if (mode === 'record') {
  const resultsPath = path.join(deployDir, '_deploy-results.json');
  let results = [];
  if (fs.existsSync(resultsPath)) {
    results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  }
  const entry = JSON.parse(resultArg);
  const idx = results.findIndex((r) => r.name === entry.name);
  if (idx >= 0) results[idx] = entry;
  else results.push(entry);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(entry));
} else if (mode === 'finalize') {
  const resultsPath = path.join(deployDir, '_deploy-results.json');
  const results = fs.existsSync(resultsPath)
    ? JSON.parse(fs.readFileSync(resultsPath, 'utf8'))
    : [];
  console.log(JSON.stringify(results, null, 2));
}
