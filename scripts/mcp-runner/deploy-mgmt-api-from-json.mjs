/**
 * Despliega Edge Function vía Supabase Management API (multipart).
 * Uso: node deploy-mgmt-api-from-json.mjs <args.json> [token]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argsPath = process.argv[2];
const token = (process.argv[3] ?? process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();

if (!argsPath || !fs.existsSync(argsPath)) {
  console.error('Uso: node deploy-mgmt-api-from-json.mjs <args.json> [token]');
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
const appendScript = path.resolve(__dirname, '../.edge-deploy/_append-deploy-result.mjs');

function appendResult(entry) {
  if (fs.existsSync(appendScript)) {
    spawnSync(process.execPath, [appendScript, JSON.stringify(entry)], { stdio: 'inherit' });
  }
}

if (!token) {
  console.log(
    JSON.stringify({
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      name: args.name,
      files: args.files.length,
      argsPath: path.resolve(argsPath),
    }),
  );
  process.exit(2);
}

const form = new FormData();
form.append(
  'metadata',
  new Blob(
    [
      JSON.stringify({
        name: args.name,
        entrypoint_path: args.entrypoint_path,
        verify_jwt: args.verify_jwt,
      }),
    ],
    { type: 'application/json' },
  ),
);

for (const file of args.files) {
  form.append('file', new Blob([file.content], { type: 'application/typescript' }), file.name);
}

const url = `https://api.supabase.com/v1/projects/${args.project_id}/functions/deploy?slug=${encodeURIComponent(args.name)}`;

try {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const entry = {
      name: args.name,
      error: parsed?.message ?? parsed?.error ?? text.slice(0, 500) ?? `HTTP ${res.status}`,
    };
    appendResult(entry);
    console.log(JSON.stringify(entry));
    process.exit(1);
  }
  const entry = { name: args.name, version: parsed?.version ?? parsed?.id ?? null };
  appendResult(entry);
  console.log(JSON.stringify(entry));
} catch (err) {
  const entry = { name: args.name, error: String(err.message ?? err) };
  appendResult(entry);
  console.log(JSON.stringify(entry));
  process.exit(1);
}
