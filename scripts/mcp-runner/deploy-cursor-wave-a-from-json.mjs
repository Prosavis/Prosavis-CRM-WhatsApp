/**
 * Despliega las 7 funciones wave A leyendo _cursor-deploy-{name}.json.
 * Usa el payload como argumentos de deploy_edge_function (mismo contrato que CallMcpTool).
 *
 * Requiere SUPABASE_ACCESS_TOKEN en env o argv[2].
 * Uso: node deploy-cursor-wave-a-from-json.mjs [token]
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

const token = process.argv[2]?.trim() || process.env.SUPABASE_ACCESS_TOKEN?.trim();
const results = [];

async function deployArgs(args) {
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
  const version = body?.version ?? body?.data?.version ?? body?.id ?? null;
  return { name, version };
}

if (!token) {
  for (const name of ORDER) {
    results.push({ name, error: 'SUPABASE_ACCESS_TOKEN requerido' });
  }
  console.log(JSON.stringify(results));
  process.exit(2);
}

for (const name of ORDER) {
  const src = path.join(deployDir, `_cursor-deploy-${name}.json`);
  if (!fs.existsSync(src)) {
    results.push({ name, error: `missing ${src}` });
    continue;
  }
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  process.stderr.write(`Deploying ${name} (${args.files.length} files)...\n`);
  try {
    results.push(await deployArgs(args));
  } catch (err) {
    results.push({ name, error: String(err.message ?? err) });
  }
}

const outPath = path.join(deployDir, '_deploy-results-wave-a.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
