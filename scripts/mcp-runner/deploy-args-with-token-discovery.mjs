/**
 * Despliega args JSON vía createSupabaseApiPlatform (token auto-discovery).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function findToken(explicit) {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const secretsPath = path.join(repoRoot, '.env.secrets.local');
  if (fs.existsSync(secretsPath)) {
    for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  const appData = process.env.APPDATA;
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

const argsPath = path.resolve(process.argv[2] ?? '');
const token = findToken(process.argv[3]);
const raw = fs.readFileSync(argsPath, 'utf8').replace(/^\uFEFF/, '');
const args = JSON.parse(raw);
args.files = (args.files ?? []).map((f) => ({
  name: f.name,
  content: String(f.content ?? '').replace(/^\uFEFF/, ''),
}));

if (!token) {
  console.log(JSON.stringify({ name: args.name, ok: false, error: 'no SUPABASE_ACCESS_TOKEN; use CallMcpTool' }));
  process.exit(2);
}

try {
  const platform = createSupabaseApiPlatform({ accessToken: token });
  const deployed = await platform.functions.deployEdgeFunction(args.project_id, {
    name: args.name,
    entrypoint_path: args.entrypoint_path,
    verify_jwt: args.verify_jwt,
    files: args.files,
  });
  console.log(
    JSON.stringify({
      name: args.name,
      ok: true,
      version: deployed.version ?? deployed.id ?? null,
    }),
  );
} catch (err) {
  console.log(JSON.stringify({ name: args.name, ok: false, error: String(err.message ?? err) }));
  process.exit(1);
}
