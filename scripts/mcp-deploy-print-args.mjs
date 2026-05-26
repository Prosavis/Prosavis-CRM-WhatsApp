/**
 * Invoca deploy_edge_function vía MCP leyendo _mcp-call-{name}.json.
 * El agente debe usar CallMcpTool con el JSON impreso en stdout (una línea).
 * Uso: node scripts/mcp-deploy-print-args.mjs <function-name>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');
const name = process.argv[2];
if (!name) {
  console.error('Uso: node mcp-deploy-print-args.mjs <function-name>');
  process.exit(1);
}
const src = path.join(deployDir, `_mcp-call-${name}.json`);
if (!fs.existsSync(src)) {
  console.error('No existe', src);
  process.exit(1);
}
process.stdout.write(fs.readFileSync(src, 'utf8'));
