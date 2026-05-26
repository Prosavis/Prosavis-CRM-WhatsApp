/**
 * Lee _mcp-call-{name}.json y escribe args listos para deploy_edge_function (MCP).
 * Uso: node scripts/deploy-mcp-call-one.mjs <function-name>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');

const name = process.argv[2];
if (!name) {
  console.error('Uso: node deploy-mcp-call-one.mjs <function-name>');
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
process.stdout.write(JSON.stringify({ name: args.name, files: args.files.length, out }));
