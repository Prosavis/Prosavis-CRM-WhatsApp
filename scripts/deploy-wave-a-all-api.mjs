/**
 * Despliega las 7 funciones wave-a en orden.
 * Token: SUPABASE_ACCESS_TOKEN o .env.secrets.local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');

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

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

const token = loadToken();
if (!token) {
  console.error('Falta SUPABASE_ACCESS_TOKEN.');
  process.exit(2);
}

const results = [];

for (const name of ORDER) {
  const src = path.join(deployDir, `wave-a-${name}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  const { project_id, entrypoint_path, verify_jwt, files } = args;

  const form = new FormData();
  form.append(
    'metadata',
    JSON.stringify({ entrypoint_path, name, verify_jwt }),
  );
  for (const file of files) {
    form.append('file', new Blob([file.content], { type: 'text/plain' }), file.name);
  }

  const url = `https://api.supabase.com/v1/projects/${project_id}/functions/deploy?slug=${encodeURIComponent(name)}`;
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
    results.push({
      name,
      ok: res.ok,
      version: body?.version ?? null,
      error: res.ok
        ? null
        : body?.message ?? body?.error ?? text.slice(0, 300),
    });
  } catch (err) {
    results.push({ name, ok: false, version: null, error: String(err) });
  }
}

const outPath = path.join(deployDir, '_deploy-results.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
