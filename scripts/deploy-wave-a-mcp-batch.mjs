/**
 * Lee _mcp-args-{name}.json y escribe _invoke-payload.json para despliegue MCP.
 * Uso: node scripts/deploy-wave-a-mcp-batch.mjs <function-name>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');

const name = process.argv[2];
if (!name) {
  console.error('Uso: node deploy-wave-a-mcp-batch.mjs <function-name>');
  process.exit(1);
}

const candidates = [
  path.join(deployDir, `_mcp-args-${name}.json`),
  path.join(deployDir, `wave-a-${name}.json`),
];
const src = candidates.find((p) => fs.existsSync(p));
if (!src) {
  console.error('No se encontró payload para', name);
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(src, 'utf8'));
const out = path.join(deployDir, '_invoke-payload.json');
fs.writeFileSync(out, JSON.stringify(args));
console.log(out);
