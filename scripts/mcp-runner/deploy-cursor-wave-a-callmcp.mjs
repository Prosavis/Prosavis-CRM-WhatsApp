/**
 * Despliega wave A leyendo _cursor-deploy-*.json vía Supabase Management API.
 * Token: SUPABASE_ACCESS_TOKEN env o .env.secrets.local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');

const NAMES = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

function loadToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.resolve(__dirname, '..', '..', '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

async function deployOne(args, token) {
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
    body = {};
  }
  if (!res.ok) {
    return { name: args.name, error: body?.message ?? text.slice(0, 500) };
  }
  return { name: args.name, version: body?.version ?? body?.id ?? null };
}

const token = loadToken();
const results = [];

if (!token) {
  for (const name of NAMES) {
    results.push({
      name,
      error: 'Use CallMcpTool deploy_edge_function (no SUPABASE_ACCESS_TOKEN local)',
    });
  }
  console.log(JSON.stringify(results));
  process.exit(2);
}

for (const name of NAMES) {
  const src = path.join(deployDir, `_cursor-deploy-${name}.json`);
  if (!fs.existsSync(src)) {
    results.push({ name, error: `missing ${src}` });
    continue;
  }
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  process.stderr.write(`Deploy ${name} (${args.files.length} files)...\n`);
  try {
    results.push(await deployOne(args, token));
  } catch (err) {
    results.push({ name, error: String(err.message ?? err) });
  }
}

console.log(JSON.stringify(results));
process.exit(results.some((r) => r.error) ? 1 : 0);
