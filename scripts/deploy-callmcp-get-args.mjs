/** Emite payload deploy_edge_function desde _mcp-call-{name}.json */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');
const name = process.argv[2];
if (!name) {
  console.error('Uso: node deploy-callmcp-get-args.mjs <function-name>');
  process.exit(1);
}
const src = path.join(deployDir, `_mcp-call-${name}.json`);
const args = JSON.parse(fs.readFileSync(src, 'utf8'));
process.stdout.write(
  JSON.stringify({
    project_id: args.project_id,
    name: args.name,
    entrypoint_path: args.entrypoint_path,
    verify_jwt: args.verify_jwt,
    files: args.files,
  }),
);
