/**
 * Lee args JSON completo y lo pasa a deploy via createSupabaseApiPlatform o indica CallMcpTool.
 * node run-deploy-from-args-json.mjs <args.json>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function findToken(explicit) {
  if (explicit?.trim()?.startsWith('sbp_')) return explicit.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()?.startsWith('sbp_')) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  for (const rel of ['.env.secrets.local', '.env.local', '.env']) {
    const p = path.join(repoRoot, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
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

const out = { name: args.name, files: args.files.length };

if (!token) {
  console.log(JSON.stringify({ ...out, ok: false, needCallMcpTool: true }));
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
  console.log(JSON.stringify({ name: args.name, ok: true, version: deployed.version ?? null }));
} catch (err) {
  console.log(JSON.stringify({ name: args.name, ok: false, error: String(err.message ?? err) }));
  process.exit(1);
}
