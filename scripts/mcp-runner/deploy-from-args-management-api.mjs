/**
 * Despliega Edge Function leyendo args JSON vía Management API (multipart).
 * Equivalente a deploy_edge_function MCP. Requiere SUPABASE_ACCESS_TOKEN.
 */
import fs from 'fs';
import path from 'path';

const argsPath = path.resolve(process.argv[2] ?? '');
const token = (process.argv[3] ?? process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();

if (!argsPath || !fs.existsSync(argsPath)) {
  console.log(JSON.stringify({ ok: false, error: `No existe: ${argsPath}` }));
  process.exit(1);
}

const raw = fs.readFileSync(argsPath, 'utf8').replace(/^\uFEFF/, '');
const args = JSON.parse(raw);
args.files = (args.files ?? []).map((f) => ({
  name: f.name,
  content: String(f.content ?? '').replace(/^\uFEFF/, ''),
}));

if (!token) {
  console.log(
    JSON.stringify({
      name: args.name,
      ok: false,
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      files: args.files.length,
    }),
  );
  process.exit(2);
}

const form = new FormData();
form.append(
  'metadata',
  JSON.stringify({
    entrypoint_path: args.entrypoint_path,
    name: args.name,
    verify_jwt: args.verify_jwt,
  }),
);
for (const file of args.files) {
  form.append('file', new Blob([file.content], { type: 'text/plain' }), file.name);
}

const url = `https://api.supabase.com/v1/projects/${args.project_id}/functions/deploy?slug=${encodeURIComponent(args.name)}`;
const res = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});

const text = await res.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = { raw: text };
}

if (!res.ok) {
  console.log(
    JSON.stringify({
      name: args.name,
      ok: false,
      error: body?.message ?? body?.error ?? text.slice(0, 500),
    }),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({
    name: args.name,
    ok: true,
    version: body?.version ?? body?.data?.version ?? null,
  }),
);
