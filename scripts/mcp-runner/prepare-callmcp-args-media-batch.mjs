/**
 * Construye args desde fuentes en disco y despliega vía CallMcpTool (agente).
 * Escribe _callmcp-args-only.json listo para deploy_edge_function.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const payloadPath = path.join(
  repoRoot,
  'scripts',
  '.edge-deploy-payloads',
  'send-whatsapp-media-batch.json',
);
const outPath = path.join(repoRoot, 'scripts', '.edge-deploy-payloads', '_callmcp-args-only.json');

const raw = fs.readFileSync(payloadPath, 'utf8').replace(/^\uFEFF/, '');
const args = JSON.parse(raw);
args.files = (args.files ?? []).map((f) => ({
  name: f.name,
  content: String(f.content ?? '').replace(/^\uFEFF/, ''),
}));

fs.writeFileSync(outPath, JSON.stringify(args), 'utf8');
console.log(
  JSON.stringify({
    name: args.name,
    files: args.files.length,
    bytes: JSON.stringify(args).length,
    outPath,
  }),
);
