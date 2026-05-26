/**
 * Lee _mcp-call-{name}.json y escribe _current-mcp-args.json para invocación MCP.
 * Uso: node scripts/mcp-deploy-read-args.mjs <function-name>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');
const name = process.argv[2];
if (!name) {
  console.error('Uso: node mcp-deploy-read-args.mjs <function-name>');
  process.exit(1);
}
const src = path.join(deployDir, `_mcp-call-${name}.json`);
if (!fs.existsSync(src)) {
  console.error('No existe', src);
  process.exit(1);
}
const args = JSON.parse(fs.readFileSync(src, 'utf8'));
const out = path.join(deployDir, '_current-mcp-args.json');
fs.writeFileSync(out, JSON.stringify(args));
console.log(JSON.stringify({ name: args.name, files: args.files.length, bytes: JSON.stringify(args).length }));
