/**
 * Lee args JSON y escribe envelope CallMcpTool a stdout (UTF-8).
 * Uso: node emit-callmcp-deploy-envelope.mjs <args.json>
 */
import fs from 'fs';
import path from 'path';

const argsPath = path.resolve(process.argv[2] ?? '');
if (!argsPath || !fs.existsSync(argsPath)) {
  process.stderr.write(JSON.stringify({ error: `No existe: ${argsPath}` }));
  process.exit(1);
}

const raw = fs.readFileSync(argsPath, 'utf8').replace(/^\uFEFF/, '');
const args = JSON.parse(raw);
args.files = (args.files ?? []).map((f) => ({
  name: f.name,
  content: String(f.content ?? '').replace(/^\uFEFF/, ''),
}));

const envelope = {
  server: 'plugin-supabase-supabase',
  toolName: 'deploy_edge_function',
  arguments: args,
};

process.stdout.write(JSON.stringify(envelope));
