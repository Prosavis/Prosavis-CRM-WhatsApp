/**
 * Despliega las 7 funciones leyendo _mcp-call-{name}.json.
 * Usa el mismo endpoint que deploy_edge_function (Management API multipart).
 * Token: SUPABASE_ACCESS_TOKEN env, .env.secrets.local, o argv[2].
 * Uso: node scripts/deploy-callmcp-all-from-json.mjs [token]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

function loadToken(cliToken) {
  if (cliToken?.trim()) return cliToken.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.resolve(__dirname, '..', '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

async function deployViaApi(args, token) {
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
    throw new Error(body?.message ?? body?.error ?? text.slice(0, 500));
  }
  return body?.version ?? body?.data?.version ?? null;
}

const token = loadToken(process.argv[2]);
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN no está definido.');
  process.exit(2);
}

const results = [];
for (const name of ORDER) {
  const src = path.join(deployDir, `_mcp-call-${name}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  try {
    const version = await deployViaApi(args, token);
    results.push({ name, version });
    console.error(`OK ${name} v${version} (${args.files.length} files)`);
  } catch (err) {
    const error = String(err.message ?? err);
    results.push({ name, error });
    console.error(`FAIL ${name}: ${error}`);
  }
}

const outPath = path.join(deployDir, '_deploy-results.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
