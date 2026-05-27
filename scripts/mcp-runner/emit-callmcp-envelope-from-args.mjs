/**
 * Lee args JSON y emite envelope {server, toolName, arguments} para CallMcpTool.
 * Uso: node emit-callmcp-envelope-from-args.mjs <args.json> [out.json]
 */
import fs from 'fs';
import path from 'path';

const argsPath = path.resolve(process.argv[2] ?? '');
const outPath = process.argv[3] ? path.resolve(process.argv[3]) : '';

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

const line = JSON.stringify(envelope);
if (outPath) fs.writeFileSync(outPath, line, 'utf8');
console.log(JSON.stringify({ name: args.name, files: args.files.length, bytes: line.length, outPath: outPath || null }));
