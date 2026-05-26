/**
 * Despliega wave A: lee _callmcp-args-{name}.json y emite resultados JSON.
 * Sin token local, imprime args completos a stdout (para CallMcpTool del agente).
 * Con token (argv[2] / env / .env.secrets.local), despliega vía Management API.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

function loadToken() {
  const arg = process.argv[2]?.trim();
  if (arg) return arg;
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

async function deployArgs(args, token) {
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
    return { name, error: body?.message ?? body?.error ?? text.slice(0, 500) };
  }
  return { name, version: body?.version ?? body?.data?.version ?? null };
}

const onlyName = process.argv[3]?.trim();
const names = onlyName ? [onlyName] : ORDER;
const token = loadToken();

if (!token) {
  if (onlyName) {
    const src = path.join(deployDir, `_callmcp-args-${onlyName}.json`);
    process.stdout.write(fs.readFileSync(src, 'utf8'));
    process.exit(0);
  }
  console.log(JSON.stringify({ mode: 'callmcp', names, hint: 'Pasar argv[3]=nombre para emitir args de una función' }));
  process.exit(0);
}

const results = [];
for (const name of names) {
  const src = path.join(deployDir, `_callmcp-args-${name}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  process.stderr.write(`Deploy ${name}...\n`);
  try {
    results.push(await deployArgs(args, token));
  } catch (err) {
    results.push({ name, error: String(err.message ?? err) });
  }
}
console.log(JSON.stringify(results));
