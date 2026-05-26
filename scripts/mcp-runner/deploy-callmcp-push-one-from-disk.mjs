/**
 * Despliega una función leyendo _callmcp-args-{name}.json.
 * Token: argv[3] o SUPABASE_ACCESS_TOKEN. Sin token: stdout = args JSON (para CallMcpTool).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

const name = process.argv[2]?.trim();
const token = (process.argv[3] ?? process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const runner = path.join(__dirname, 'deploy-callmcp-wave-a-runner.mjs');
const src = path.resolve(__dirname, '..', '.edge-deploy', `_callmcp-args-${name}.json`);

if (!name || !fs.existsSync(src)) {
  console.error('Uso: node deploy-callmcp-push-one-from-disk.mjs <function-name> [token]');
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(src, 'utf8'));

function record(entry) {
  spawnSync(process.execPath, [runner, 'record', JSON.stringify(entry)], {
    stdio: 'inherit',
    cwd: repoRoot,
  });
}

if (!token) {
  process.stdout.write(JSON.stringify(args));
  process.exit(0);
}

try {
  const platform = createSupabaseApiPlatform({ accessToken: token });
  const deployed = await platform.functions.deployEdgeFunction(args.project_id, {
    name: args.name,
    entrypoint_path: args.entrypoint_path,
    verify_jwt: args.verify_jwt,
    files: args.files,
  });
  const entry = { name, version: deployed.version ?? deployed.id ?? null };
  record(entry);
  console.log(JSON.stringify(entry));
} catch (err) {
  const entry = { name, error: String(err.message ?? err) };
  record(entry);
  console.log(JSON.stringify(entry));
  process.exit(1);
}
