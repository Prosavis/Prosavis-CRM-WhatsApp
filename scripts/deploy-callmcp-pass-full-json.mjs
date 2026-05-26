/**
 * Lee payload JSON y despliega vía Management API (mismo endpoint que deploy_edge_function).
 * Si no hay token, imprime instrucción para CallMcpTool.
 * Uso: node deploy-callmcp-pass-full-json.mjs <json-path>
 */
import fs from 'fs';

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('Uso: node deploy-callmcp-pass-full-json.mjs <json-path>');
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!token) {
  console.log(
    JSON.stringify({
      action: 'CallMcpTool',
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      name: args.name,
      files: args.files.length,
      argsPath: jsonPath,
    }),
  );
  process.exit(0);
}

const { project_id, name, entrypoint_path, verify_jwt, files } = args;
const form = new FormData();
form.append('metadata', JSON.stringify({ entrypoint_path, name, verify_jwt }));
for (const file of files) {
  form.append('file', new Blob([file.content], { type: 'text/plain' }), file.name);
}

const url = `https://api.supabase.com/v1/projects/${project_id}/functions/deploy?slug=${encodeURIComponent(name)}`;
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
  body = {};
}
if (!res.ok) {
  console.log(JSON.stringify({ name, error: body?.message ?? text.slice(0, 500) }));
} else {
  console.log(JSON.stringify({ name, version: body?.version ?? body?.data?.version ?? null }));
}
