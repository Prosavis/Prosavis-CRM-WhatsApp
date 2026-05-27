/**
 * Despliega leyendo args JSON (ruta completa). Mismo contrato que deploy_edge_function.
 * Uso: node deploy-from-args-path.mjs <args.json>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

const argsPath = path.resolve(process.argv[2] ?? '');
if (!argsPath || !fs.existsSync(argsPath)) {
  console.error(JSON.stringify({ ok: false, error: `No existe: ${argsPath}` }));
  process.exit(1);
}

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.log(
    JSON.stringify({
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      argsPath,
    }),
  );
  process.exit(2);
}

const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
args.files = (args.files ?? []).map((f) => ({
  name: f.name,
  content: String(f.content ?? '').replace(/^\uFEFF/, ''),
}));

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
