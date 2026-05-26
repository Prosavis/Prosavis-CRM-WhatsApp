/**
 * Despliega las 7 funciones leyendo scripts/.edge-deploy/_mcp-call-{name}.json
 * vía createSupabaseApiPlatform (mismo endpoint que deploy_edge_function MCP).
 * Token: argv[2] o SUPABASE_ACCESS_TOKEN.
 * Sin token: exit 2 → agente usa CallMcpTool deploy_edge_function.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '../.edge-deploy');
const resultsPath = path.join(deployDir, '_deploy-results.json');

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

function loadToken(explicit) {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const secretsPath = path.resolve(__dirname, '../../.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const token = loadToken(process.argv[2]);
if (!token) {
  console.log(
    JSON.stringify({
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      order: ORDER,
      jsonPattern: '_mcp-call-{name}.json',
    }),
  );
  process.exit(2);
}

const platform = createSupabaseApiPlatform({ accessToken: token });
const results = [];

for (const name of ORDER) {
  const src = path.join(deployDir, `_mcp-call-${name}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  try {
    const deployed = await platform.functions.deployEdgeFunction(args.project_id, {
      name: args.name,
      entrypoint_path: args.entrypoint_path,
      verify_jwt: args.verify_jwt,
      files: args.files,
    });
    const entry = { name, version: deployed.version ?? deployed.id ?? null };
    results.push(entry);
    process.stderr.write(`OK ${name} v${entry.version} (${args.files.length} files)\n`);
  } catch (err) {
    const entry = { name, error: String(err.message ?? err) };
    results.push(entry);
    process.stderr.write(`FAIL ${name}: ${entry.error}\n`);
  }
}

fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
