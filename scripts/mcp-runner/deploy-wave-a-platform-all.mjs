/**
 * Despliega las 7 funciones wave A leyendo _callmcp-args-{name}.json.
 * Token: argv[2] o SUPABASE_ACCESS_TOKEN o .env.secrets.local
 * Sin token: exit 2 + needCallMcpTool por función.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

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
  console.log(
    JSON.stringify({
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      order: ORDER,
    }),
  );
  process.exit(2);
}

const platform = createSupabaseApiPlatform({ accessToken: token });
const results = [];

for (const name of ORDER) {
  const src = path.join(deployDir, `_callmcp-args-${name}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  process.stderr.write(`Deploy ${name} (${args.files.length} files)...\n`);
  try {
    const deployed = await platform.functions.deployEdgeFunction(args.project_id, {
      name: args.name,
      entrypoint_path: args.entrypoint_path,
      verify_jwt: args.verify_jwt,
      files: args.files,
    });
    const entry = { name, version: deployed.version ?? deployed.id ?? null };
    record(entry);
    results.push(entry);
    process.stderr.write(`OK ${name} v${entry.version}\n`);
  } catch (err) {
    const entry = { name, error: String(err.message ?? err) };
    record(entry);
    results.push(entry);
    process.stderr.write(`ERR ${name}: ${entry.error}\n`);
  }
}

let suggestFixed = false;
try {
  const fn = await platform.functions.getEdgeFunction('djzwjaegxbhlefanmmee', 'suggest-whatsapp-agent-reply');
  const idx = fn.files?.find((f) => f.name === 'index.ts')?.content ?? '';
  suggestFixed = idx.includes('llmGenerateText') && !idx.includes('PLACEHOLDER') && idx.trim() !== 'PLACEHOLDER';
} catch {
  suggestFixed = false;
}

console.log(JSON.stringify({ results, suggestFixed }));
