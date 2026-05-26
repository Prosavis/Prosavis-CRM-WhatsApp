/**
 * Despliega Edge Function leyendo JSON de args vía Platform API.
 * Uso (desde scripts/mcp-runner): node deploy-platform-from-json.mjs <args.json> [token]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argsPath = process.argv[2];
const token = (process.argv[3] ?? process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();

if (!argsPath || !fs.existsSync(argsPath)) {
  console.error('Uso: node deploy-platform-from-json.mjs <args.json> [token]');
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
const appendScript = path.resolve(__dirname, '../.edge-deploy/_append-deploy-result.mjs');

function appendResult(entry) {
  if (fs.existsSync(appendScript)) {
    spawnSync(process.execPath, [appendScript, JSON.stringify(entry)], { stdio: 'inherit' });
  }
}

if (!token) {
  console.log(
    JSON.stringify({
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      name: args.name,
      files: args.files.length,
      argsPath: path.resolve(argsPath),
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
  const entry = { name: args.name, version: deployed.version ?? deployed.id ?? null };
  appendResult(entry);
  console.log(JSON.stringify(entry));
} catch (err) {
  const entry = { name: args.name, error: String(err.message ?? err) };
  appendResult(entry);
  console.log(JSON.stringify(entry));
  process.exit(1);
}
