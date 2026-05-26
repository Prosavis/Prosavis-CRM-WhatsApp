/**
 * Despliega una función wave-a vía Management API (multipart).
 * Requiere SUPABASE_ACCESS_TOKEN en el entorno.
 *
 * Uso: node scripts/deploy-wave-a-mcp-invoke.mjs <function-name>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');

const name = process.argv[2];
if (!name) {
  console.error('Uso: node deploy-wave-a-mcp-invoke.mjs <function-name>');
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN no está definido.');
  process.exit(2);
}

const src = path.join(deployDir, `wave-a-${name}.json`);
const args = JSON.parse(fs.readFileSync(src, 'utf8'));
const { project_id, entrypoint_path, verify_jwt, files } = args;

const form = new FormData();
form.append(
  'metadata',
  JSON.stringify({
    entrypoint_path,
    name,
    verify_jwt,
  }),
);
for (const file of files) {
  const blob = new Blob([file.content], { type: 'text/plain' });
  form.append('file', blob, file.name);
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
  body = { raw: text };
}

const result = {
  name,
  ok: res.ok,
  status: res.status,
  version: body?.version ?? body?.data?.version ?? null,
  error: body?.message ?? body?.error ?? (!res.ok ? text.slice(0, 500) : null),
};
console.log(JSON.stringify(result));
