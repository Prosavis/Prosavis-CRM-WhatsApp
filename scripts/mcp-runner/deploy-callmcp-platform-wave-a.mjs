/**
 * Despliega wave A con createSupabaseApiPlatform (mismo backend que deploy_edge_function MCP).
 * Lee scripts/.edge-deploy/_callmcp-args-{name}.json
 * Token: argv[2], SUPABASE_ACCESS_TOKEN o .env.secrets.local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');
const repoRoot = path.resolve(__dirname, '..', '..');
const runner = path.join(__dirname, 'deploy-callmcp-wave-a-runner.mjs');

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

function loadToken() {
  const fromArgv = process.argv[2]?.trim();
  if (fromArgv) return fromArgv;
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const secretsPath = path.join(repoRoot, '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function record(entry) {
  spawnSync(process.execPath, [runner, 'record', JSON.stringify(entry)], {
    stdio: 'inherit',
    cwd: repoRoot,
  });
}

const token = loadToken();
if (!token) {
  console.log(JSON.stringify({ needCallMcpTool: true, order: ORDER }));
  process.exit(2);
}

const platform = createSupabaseApiPlatform({ accessToken: token });

for (const fn of ORDER) {
  const args = JSON.parse(
    fs.readFileSync(path.join(deployDir, `_callmcp-args-${fn}.json`), 'utf8'),
  );
  process.stderr.write(`Deploy ${fn} (${args.files.length} files)...\n`);
  try {
    const deployed = await platform.functions.deployEdgeFunction(args.project_id, {
      name: args.name,
      entrypoint_path: args.entrypoint_path,
      verify_jwt: args.verify_jwt,
      files: args.files,
    });
    const version = deployed.version ?? deployed.id ?? null;
    record({ name: fn, version });
    process.stderr.write(`OK ${fn} v${version}\n`);
  } catch (err) {
    record({ name: fn, error: String(err.message ?? err) });
    process.stderr.write(`ERR ${fn}: ${err.message ?? err}\n`);
  }
}

const summary = spawnSync(process.execPath, [runner, 'summary'], { encoding: 'utf8', cwd: repoRoot });
process.stdout.write(summary.stdout ?? '{}');
