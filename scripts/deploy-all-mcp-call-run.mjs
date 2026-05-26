/**
 * Despliega las 7 funciones leyendo _mcp-call-{name}.json.
 * Escribe _deploy-results.json con { name, version } o { name, error }.
 * Uso: node scripts/deploy-all-mcp-call-run.mjs
 *
 * Este script lee cada payload completo (index + _shared) y lo imprime
 * como JSON en stdout por función para invocación MCP externa.
 * También puede usarse con SUPABASE_ACCESS_TOKEN vía Management API.
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

function loadToken() {
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

async function deployViaApi(args) {
  const { project_id, name, entrypoint_path, verify_jwt, files } = args;
  const token = loadToken();
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN no está definido.');

  const form = new FormData();
  form.append(
    'metadata',
    JSON.stringify({ entrypoint_path, name, verify_jwt }),
  );
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

const mode = process.argv[2] ?? 'list';
const target = process.argv[3];

if (mode === 'args') {
  const name = target;
  const src = path.join(deployDir, `_mcp-call-${name}.json`);
  if (!fs.existsSync(src)) {
    console.error('No existe', src);
    process.exit(1);
  }
  process.stdout.write(fs.readFileSync(src, 'utf8'));
  process.exit(0);
}

if (mode === 'deploy-one') {
  const name = target;
  const src = path.join(deployDir, `_mcp-call-${name}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  try {
    const version = await deployViaApi(args);
    console.log(JSON.stringify({ name, version }));
  } catch (err) {
    console.log(JSON.stringify({ name, error: String(err.message ?? err) }));
  }
  process.exit(0);
}

if (mode === 'deploy-all') {
  const results = [];
  for (const name of ORDER) {
    const src = path.join(deployDir, `_mcp-call-${name}.json`);
    const args = JSON.parse(fs.readFileSync(src, 'utf8'));
    try {
      const version = await deployViaApi(args);
      results.push({ name, version });
    } catch (err) {
      results.push({ name, error: String(err.message ?? err) });
    }
  }
  const outPath = path.join(deployDir, '_deploy-results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

console.log(JSON.stringify({ order: ORDER, modes: ['args', 'deploy-one', 'deploy-all'] }));
