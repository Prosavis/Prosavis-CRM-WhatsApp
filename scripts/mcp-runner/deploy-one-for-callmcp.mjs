/**
 * Lee payload y escribe args listos para deploy_edge_function (stdout = args JSON).
 * Uso: node deploy-one-for-callmcp.mjs <payload.json>
 */
import fs from 'fs';
import path from 'path';

const jsonPath = path.resolve(process.argv[2] ?? '');
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.error(JSON.stringify({ error: `No existe: ${jsonPath}` }));
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
args.files = (args.files ?? []).map((f) => ({
  name: f.name,
  content: String(f.content ?? '').replace(/^\uFEFF/, ''),
}));

process.stdout.write(JSON.stringify(args));
