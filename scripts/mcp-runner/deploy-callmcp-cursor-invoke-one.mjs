/**
 * Lee _callmcp-args-{name}.json y escribe _cursor-mcp-invoke-{name}.json
 * para que el agente invoque CallMcpTool deploy_edge_function con arguments completos.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');
const name = process.argv[2]?.trim();

if (!name) {
  console.error('Uso: node deploy-callmcp-cursor-invoke-one.mjs <function-name>');
  process.exit(1);
}

const src = path.join(deployDir, `_callmcp-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(src, 'utf8'));
const out = path.join(deployDir, `_cursor-mcp-invoke-${name}.json`);
fs.writeFileSync(out, JSON.stringify({ server: 'plugin-supabase-supabase', toolName: 'deploy_edge_function', arguments: args }));
console.log(JSON.stringify({ name, out, bytes: JSON.stringify(args).length, files: args.files.length }));
