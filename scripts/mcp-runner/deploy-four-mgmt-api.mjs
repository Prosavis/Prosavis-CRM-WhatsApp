/**
 * Despliega 4 funciones vía Management API (mismo payload que deploy_edge_function).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const argsDir = path.join(repoRoot, '.cursor', '_mcp-deploy-args');

const NAMES = [
  'get-whatsapp-media-url',
  'on-whatsapp-webhook',
  'send-whatsapp-chat-message',
  'send-whatsapp-media-batch',
];

function findToken(explicit) {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.join(repoRoot, '.env.secrets.local');
  if (fs.existsSync(secretsPath)) {
    for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  const appData = process.env.APPDATA;
  if (!appData) return null;
  const root = path.join(appData, 'Cursor', 'User', 'globalStorage');
  if (!fs.existsSync(root)) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.toLowerCase().includes('supabase')) continue;
    const storageDir = path.join(root, entry.name);
    for (const file of fs.readdirSync(storageDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = fs.readFileSync(path.join(storageDir, file), 'utf8');
        const m = raw.match(/sbp_[a-zA-Z0-9]+/);
        if (m) return m[0];
      } catch {
        // ignore
      }
    }
  }
  return null;
}

async function deployOne(args, token) {
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
    body = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    throw new Error(body?.message ?? body?.error ?? text.slice(0, 300) ?? `HTTP ${res.status}`);
  }
  return { version: body?.version ?? null, slug: body?.slug ?? args.name };
}

const token = findToken(process.argv[2]);
const results = [];

if (!token) {
  console.log(JSON.stringify({ needCallMcpTool: true, names }, null, 2));
  process.exit(2);
}

for (const name of NAMES) {
  const argsPath = path.join(argsDir, `${name}.json`);
  try {
    const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
    args.files = (args.files ?? []).map((f) => ({
      name: f.name,
      content: String(f.content ?? '').replace(/^\uFEFF/, ''),
    }));
    const out = await deployOne(args, token);
    results.push({ name, ok: true, version: out.version, slug: out.slug });
  } catch (err) {
    results.push({ name, ok: false, error: String(err.message ?? err) });
  }
}

console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
