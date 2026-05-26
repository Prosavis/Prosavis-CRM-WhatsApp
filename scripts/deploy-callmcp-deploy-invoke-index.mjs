/**
 * Despliega _invoke-{index}.json leyendo payload completo.
 * Emite JSON {name, version} o {name, error} en stdout.
 * Uso interno: node deploy-callmcp-deploy-invoke-index.mjs <index>
 * El agente debe usar CallMcpTool; este script prepara/valida payloads.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');
const idx = Number(process.argv[2] ?? 0);
const invokePath = path.join(deployDir, `_invoke-${idx}.json`);

if (!fs.existsSync(invokePath)) {
  console.log(JSON.stringify({ error: `No existe ${invokePath}` }));
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));
console.log(
  JSON.stringify({
    project_id: args.project_id,
    name: args.name,
    entrypoint_path: args.entrypoint_path,
    verify_jwt: args.verify_jwt,
    files: args.files,
  }),
);
