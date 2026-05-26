/**
 * Despliega wave A vía Management API si hay SUPABASE_ACCESS_TOKEN.
 * Sin token: imprime hint para CallMcpTool.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');
const repoRoot = path.resolve(__dirname, '..', '..');
const runner = path.join(__dirname, 'deploy-callmcp-wave-a-runner.mjs');

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
  const secretsPath = path.join(repoRoot, '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function record(entry) {
  spawnSync(process.execPath, [runner, 'record', JSON.stringify(entry)], {
    stdio: 'inherit',
    cwd: repoRoot,
  });
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
  if (!res.ok) return { name, error: body?.message ?? text.slice(0, 500) };
  return { name, version: body?.version ?? body?.data?.version ?? null };
}

const token = loadToken();
if (!token) {
  console.log(JSON.stringify({ mode: 'NO_TOKEN', needCallMcpTool: true, order: ORDER }));
  process.exit(2);
}

const results = [];
for (const fn of ORDER) {
  const args = JSON.parse(
    fs.readFileSync(path.join(deployDir, `_callmcp-args-${fn}.json`), 'utf8'),
  );
  process.stderr.write(`Deploying ${fn} (${args.files.length} files)...\n`);
  try {
    const r = await deployViaApi(args, token);
    record(r);
    results.push(r);
    process.stderr.write(`${r.version != null ? 'OK' : 'FAIL'} ${fn}\n`);
  } catch (err) {
    const entry = { name: fn, error: String(err.message ?? err) };
    record(entry);
    results.push(entry);
  }
}

const summary = spawnSync(process.execPath, [runner, 'summary'], {
  encoding: 'utf8',
  cwd: repoRoot,
});
process.stdout.write(summary.stdout ?? JSON.stringify(results));
