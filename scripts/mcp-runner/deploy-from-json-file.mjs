/**
 * Despliega deploy_edge_function leyendo args JSON (payload completo con files[]).
 * Uso: node deploy-from-json-file.mjs <args.json>
 * Requiere SUPABASE_ACCESS_TOKEN o token en argv[3].
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function loadToken(cli) {
  if (cli?.trim()) return cli.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
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
  console.error(JSON.stringify({ ok: false, error: `No existe: ${argsPath}` }));
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
args.files = (args.files ?? []).map((f) => ({
  name: f.name,
  content: String(f.content ?? '').replace(/^\uFEFF/, ''),
}));

const token = loadToken(process.argv[3]);
if (!token) {
  console.log(
    JSON.stringify({
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      argsPath,
      name: args.name,
    }),
  );
  process.exit(2);
}

const platform = createSupabaseApiPlatform({ accessToken: token });

try {
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
      slug: deployed.slug ?? args.name,
    }),
  );
} catch (err) {
  console.log(JSON.stringify({ name: args.name, ok: false, error: String(err.message ?? err) }));
  process.exit(1);
}
