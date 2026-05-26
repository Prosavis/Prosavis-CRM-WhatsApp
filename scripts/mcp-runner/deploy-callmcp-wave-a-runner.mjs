/**
 * Despliega wave A: lee _callmcp-args-{name}.json y registra resultados.
 * Modos:
 *   node deploy-callmcp-wave-a-runner.mjs next     -> imprime nombre siguiente sin desplegar
 *   node deploy-callmcp-wave-a-runner.mjs record '{"name":"...","version":1}'
 *   node deploy-callmcp-wave-a-runner.mjs args <name> -> imprime args JSON a stdout
 *   node deploy-callmcp-wave-a-runner.mjs summary    -> imprime resultados + suggestFixed
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

const resultsPath = path.join(deployDir, '_deploy-results-wave-a.json');
const statePath = path.join(deployDir, '_deploy-wave-a-state.json');

function readResults() {
  if (!fs.existsSync(resultsPath)) return [];
  return JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
}

function readState() {
  if (!fs.existsSync(statePath)) return { index: 0 };
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function writeState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

const mode = process.argv[2] ?? 'next';

if (mode === 'args') {
  const name = process.argv[3]?.trim();
  if (!name) {
    console.error('Uso: node deploy-callmcp-wave-a-runner.mjs args <function-name>');
    process.exit(1);
  }
  const src = path.join(deployDir, `_callmcp-args-${name}.json`);
  process.stdout.write(fs.readFileSync(src, 'utf8'));
  process.exit(0);
}

if (mode === 'record') {
  const entry = JSON.parse(process.argv[3] ?? '{}');
  const results = readResults();
  const idx = results.findIndex((r) => r.name === entry.name);
  if (idx >= 0) results[idx] = entry;
  else results.push(entry);
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  const state = readState();
  if (state.current === entry.name) {
    state.index = (state.index ?? 0) + 1;
    state.current = null;
    writeState(state);
  }
  console.log(JSON.stringify(entry));
  process.exit(0);
}

if (mode === 'next') {
  const state = readState();
  const results = readResults();
  const done = new Set(results.map((r) => r.name));
  const next = ORDER.find((n) => !done.has(n));
  if (!next) {
    console.log(JSON.stringify({ done: true }));
    process.exit(0);
  }
  state.current = next;
  writeState(state);
  const args = JSON.parse(fs.readFileSync(path.join(deployDir, `_callmcp-args-${next}.json`), 'utf8'));
  console.log(JSON.stringify({ name: next, fileCount: args.files.length }));
  process.exit(0);
}

if (mode === 'summary') {
  const results = readResults();
  const suggestFixed = false; // agent must set after get_edge_function
  console.log(JSON.stringify({ results, suggestFixed }));
  process.exit(0);
}

console.error('Modo desconocido:', mode);
process.exit(1);
