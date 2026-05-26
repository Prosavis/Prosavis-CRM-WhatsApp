/**
 * Despliega leyendo un JSON de args (mismo formato que deploy_edge_function MCP).
 * Token: argv[3] o SUPABASE_ACCESS_TOKEN o .env.secrets.local
 * Sin token: exit 2 + needCallMcpTool
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const runner = path.join(__dirname, 'deploy-callmcp-wave-a-runner.mjs');

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

const argsPath = process.argv[2];
const recordName = process.argv[4] === '--no-record' ? null : process.argv[2]?.includes('callmcp-args-')
  ? path.basename(argsPath).replace('_callmcp-args-', '').replace('.json', '')
  : null;

if (!argsPath || !fs.existsSync(argsPath)) {
  console.error('Uso: node deploy-callmcp-deploy-from-args-file.mjs <args.json> [token]');
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
const token = loadToken(process.argv[3]);

if (!token) {
  console.log(
    JSON.stringify({
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      argsPath,
      name: args.name,
      files: args.files.length,
      bytes: JSON.stringify(args).length,
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
  const entry = { name: args.name, version: deployed.version ?? deployed.id ?? null };
  if (recordName) {
    spawnSync(process.execPath, [runner, 'record', JSON.stringify(entry)], {
      stdio: 'inherit',
      cwd: repoRoot,
    });
  }
  console.log(JSON.stringify(entry));
} catch (err) {
  const entry = { name: args.name, error: String(err.message ?? err) };
  if (recordName) {
    spawnSync(process.execPath, [runner, 'record', JSON.stringify(entry)], {
      stdio: 'inherit',
      cwd: repoRoot,
    });
  }
  console.log(JSON.stringify(entry));
  process.exit(1);
}
