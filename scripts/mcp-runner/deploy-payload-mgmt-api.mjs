/**
 * deploy_edge_function equivalent via Management API (mismo payload que MCP).
 * Uso: node deploy-payload-mgmt-api.mjs <payload.json> [SUPABASE_ACCESS_TOKEN]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function loadToken(explicit) {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.join(repoRoot, '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const jsonPath = path.resolve(process.argv[2] ?? '');
const token = loadToken(process.argv[3]);
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.log(JSON.stringify({ error: `No existe: ${jsonPath}` }));
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

if (!token) {
  console.log(
    JSON.stringify({
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      payloadPath: jsonPath,
      name: args.name,
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

try {
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
    console.log(
      JSON.stringify({
        name: args.name,
        ok: false,
        error: body?.message ?? text.slice(0, 500),
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
} catch (err) {
  console.log(JSON.stringify({ name: args.name, ok: false, error: String(err.message ?? err) }));
  process.exit(1);
}
