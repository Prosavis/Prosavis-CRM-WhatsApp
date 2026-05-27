/**
 * Lee args JSON y los imprime en una línea para invocación MCP (stdout).
 * Uso: node callmcp-deploy-from-args.mjs <ruta-args.json>
 */
import fs from 'fs';
import path from 'path';

const argsPath = path.resolve(process.argv[2] ?? '');
if (!argsPath || !fs.existsSync(argsPath)) {
  console.error(JSON.stringify({ error: `No existe: ${argsPath}` }));
  process.exit(1);
}
const raw = fs.readFileSync(argsPath, 'utf8').replace(/^\uFEFF/, '');
const args = JSON.parse(raw);
for (const f of args.files ?? []) {
  if (f.name === 'index.ts' && typeof f.content === 'string') {
    f.content = f.content.replace(/^\uFEFF/, '');
  }
}
process.stdout.write(JSON.stringify(args));
