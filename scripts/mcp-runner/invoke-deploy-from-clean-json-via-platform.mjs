/**
 * Despliega leyendo args JSON limpio vía createSupabaseApiPlatform (Management API).
 * Uso: node invoke-deploy-from-clean-json-via-platform.mjs <args.json> [sbp_token]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function loadToken(explicit) {
  if (explicit?.trim()?.startsWith('sbp_')) return explicit.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()?.startsWith('sbp_')) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.join(repoRoot, '.env.secrets.local');
  if (fs.existsSync(secretsPath)) {
    for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

const argsPath = path.resolve(process.argv[2] ?? '');
if (!argsPath || !fs.existsSync(argsPath)) {
  console.log(JSON.stringify({ ok: false, error: `No existe: ${argsPath}` }));
  process.exit(1);
}

const raw = fs.readFileSync(argsPath, 'utf8').replace(/^\uFEFF/, '');
const args = JSON.parse(raw);
args.files = (args.files ?? []).map((f) => ({
  name: f.name,
  content: String(f.content ?? '').replace(/^\uFEFF/, ''),
}));

const token = loadToken(process.argv[3]);
if (!token) {
  console.log(
    JSON.stringify({
      name: args.name,
      ok: false,
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      argsPath,
      files: args.files.length,
      bytes: JSON.stringify(args).length,
    }),
  );
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
      version: deployed.version ?? null,
      slug: deployed.slug ?? args.name,
    }),
  );
} catch (err) {
  console.log(JSON.stringify({ name: args.name, ok: false, error: String(err.message ?? err) }));
  process.exit(1);
}
