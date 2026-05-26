/**
 * Prepara args para CallMcpTool deploy_edge_function (una función).
 * Escribe _callmcp-args-only.json con payload completo (index + _shared).
 * Uso: node scripts/deploy-callmcp-prepare.mjs <function-name>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');

const name = process.argv[2];
if (!name) {
  console.error('Uso: node deploy-callmcp-prepare.mjs <function-name>');
  process.exit(1);
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
console.log(JSON.stringify({ name: args.name, files: args.files.length, bytes: fs.statSync(out).size }));
