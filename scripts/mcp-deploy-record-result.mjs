/**
 * Registra resultado de deploy MCP en _deploy-results.json
 * Uso: node scripts/mcp-deploy-record-result.mjs <name> <version|error> [isError]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');
const outPath = path.join(deployDir, '_deploy-results.json');

const name = process.argv[2];
const value = process.argv[3];
const isError = process.argv[4] === 'error';

let results = [];
if (fs.existsSync(outPath)) {
  try {
    results = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  } catch {
    results = [];
  }
}

const entry = isError ? { name, error: value } : { name, version: Number(value) || value };
const idx = results.findIndex((r) => r.name === name);
if (idx >= 0) results[idx] = entry;
else results.push(entry);

fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(entry));
