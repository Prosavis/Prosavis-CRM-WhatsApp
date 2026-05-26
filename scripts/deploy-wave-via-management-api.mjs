/**
 * Despliega oleada leyendo _mcp-call-*.json vía Supabase Management API.
 * Uso: node scripts/deploy-wave-via-management-api.mjs a [token]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');
const root = path.resolve(__dirname, '..');

const WAVES = {
  a: [
    'suggest-whatsapp-agent-reply',
    'generate-whatsapp-ia-template',
    'transcribe-whatsapp-inbound-audio',
    'get-whatsapp-booking-context',
    'create-whatsapp-ia-template',
    'delete-whatsapp-ia-template',
    'resolve-whatsapp-ia-template',
  ],
};

function loadToken(argvToken) {
  if (argvToken?.trim()) return argvToken.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const secretsPath = path.join(root, '.env.secrets.local');
  if (fs.existsSync(secretsPath)) {
    for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

async function deployOne(args, token) {
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
    body = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    return { name, error: body?.message ?? text.slice(0, 500) };
  }
  return { name, version: body?.version ?? body?.id ?? 'ok' };
}

const wave = (process.argv[2] ?? 'a').toLowerCase();
const token = loadToken(process.argv[3]);
const names = WAVES[wave];
if (!names) {
  console.error('Oleada desconocida:', wave);
  process.exit(1);
}
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN requerido (argv[3], env o .env.secrets.local)');
  process.exit(2);
}

const results = [];
for (const name of names) {
  const src = path.join(deployDir, `_mcp-call-${name}.json`);
  if (!fs.existsSync(src)) {
    results.push({ name, error: 'payload no encontrado' });
    continue;
  }
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  process.stderr.write(`Deploying ${name}...\n`);
  try {
    results.push(await deployOne(args, token));
  } catch (err) {
    results.push({ name, error: String(err.message ?? err) });
  }
}

const outPath = path.join(deployDir, `_deploy-results-wave-${wave}.json`);
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => r.error) ? 1 : 0);
