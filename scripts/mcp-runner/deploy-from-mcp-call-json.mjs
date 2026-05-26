/**
 * Invoca deploy leyendo JSON desde disco; imprime SOLO el resultado {name, version|error}.
 * Usa createSupabaseApiPlatform cuando hay token; si no, exit 2 (CallMcpTool).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

const jsonPath = path.resolve(process.argv[2] ?? '');
const token = (process.argv[3] ?? process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();

if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.log(JSON.stringify({ error: `Archivo no encontrado: ${jsonPath}` }));
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

if (!token) {
  console.log(
    JSON.stringify({
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      argsPath: jsonPath,
      name: args.name,
      files: args.files?.length ?? 0,
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
  console.log(JSON.stringify({ name: args.name, version: deployed.version ?? deployed.id ?? null }));
} catch (err) {
  console.log(JSON.stringify({ name: args.name, error: String(err.message ?? err) }));
  process.exit(1);
}
