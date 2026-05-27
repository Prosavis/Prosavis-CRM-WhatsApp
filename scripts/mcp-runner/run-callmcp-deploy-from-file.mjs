/**
 * Lee args JSON y los imprime para invocación CallMcpTool (stdout = arguments only).
 * Uso: node run-callmcp-deploy-from-file.mjs <args.json>
 */
import fs from 'fs';
import path from 'path';

const jsonPath = path.resolve(process.argv[2] ?? '');
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.error(JSON.stringify({ error: `No existe: ${jsonPath}` }));
  process.exit(1);
}

const raw = fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, '');
const args = JSON.parse(raw);
args.files = (args.files ?? []).map((f) => ({
  name: f.name,
  content: String(f.content ?? '').replace(/^\uFEFF/, ''),
}));

process.stdout.write(JSON.stringify(args));
