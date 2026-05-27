/**
 * deploy_edge_function equivalent via createSupabaseApiPlatform (mismo que MCP).
 * Uso: node deploy-payload-platform-one.mjs <payload.json> [token]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function loadToken(explicit) {
  if (explicit?.trim()) return explicit.trim();
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

const jsonPath = path.resolve(process.argv[2] ?? '');
const token = loadToken(process.argv[3]);
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.log(JSON.stringify({ error: `No existe: ${jsonPath}` }));
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

if (!token) {
  console.log(
    JSON.stringify({
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      name: args.name,
      payloadPath: jsonPath,
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
      version: deployed.version ?? deployed.id ?? null,
    }),
  );
} catch (err) {
  console.log(
    JSON.stringify({
      name: args.name,
      ok: false,
      error: String(err.message ?? err),
    }),
  );
  process.exit(1);
}
