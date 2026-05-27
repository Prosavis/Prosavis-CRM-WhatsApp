/**
 * Despliega 4 funciones WhatsApp vía deploy_edge_function (API platform = MCP).
 * Token: argv[2], env, .env.secrets.local o globalStorage Cursor (sbp_*).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api.js';

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
  const roots = [
    path.join(appData, 'Cursor', 'User', 'globalStorage'),
    path.join(appData, 'cursor', 'User', 'globalStorage'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
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
  }
  return null;
}

function loadArgs(name) {
  const argsPath = path.join(argsDir, `${name}.json`);
  const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
  args.files = (args.files ?? []).map((f) => ({
    name: f.name,
    content: String(f.content ?? '').replace(/^\uFEFF/, ''),
  }));
  return args;
}

const token = findToken(process.argv[2]);
const results = [];

if (!token) {
  console.log(JSON.stringify({ needCallMcpTool: true, names }, null, 2));
  process.exit(2);
}

const platform = createSupabaseApiPlatform({ accessToken: token });

for (const name of NAMES) {
  try {
    const args = loadArgs(name);
    const deployed = await platform.functions.deployEdgeFunction(args.project_id, {
      name: args.name,
      entrypoint_path: args.entrypoint_path,
      verify_jwt: args.verify_jwt,
      files: args.files,
    });
    results.push({
      name,
      ok: true,
      version: deployed.version ?? null,
      slug: deployed.slug ?? name,
    });
  } catch (err) {
    results.push({ name, ok: false, error: String(err.message ?? err) });
  }
}

console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
