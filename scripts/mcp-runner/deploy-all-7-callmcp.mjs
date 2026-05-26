/**
 * Despliega las 7 Edge Functions leyendo _cursor-deploy-{name}.json.
 * Usa createSupabaseApiPlatform (Management API) cuando hay token.
 * Sin token: imprime instrucción para CallMcpTool por función.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '../.edge-deploy');

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

function loadToken(cliToken) {
  if (cliToken?.trim()) return cliToken.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.resolve(__dirname, '../../.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const token = loadToken(process.argv[2]);
const results = [];

if (!token) {
  console.log(
    JSON.stringify({
      mode: 'CallMcpTool',
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      order: ORDER,
      hint: 'Por cada nombre, leer scripts/.edge-deploy/_cursor-deploy-{name}.json y pasar el objeto parseado como arguments',
    }),
  );
  process.exit(2);
}

const platform = createSupabaseApiPlatform({ accessToken: token });

for (const name of ORDER) {
  const src = path.join(deployDir, `_cursor-deploy-${name}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  try {
    const deployed = await platform.functions.deployEdgeFunction(args.project_id, {
      name: args.name,
      entrypoint_path: args.entrypoint_path,
      verify_jwt: args.verify_jwt,
      files: args.files,
    });
    const version = deployed.version ?? null;
    results.push({ name, version });
    process.stderr.write(`OK ${name} v${version} (${args.files.length} files)\n`);
  } catch (err) {
    const error = String(err.message ?? err);
    results.push({ name, error });
    process.stderr.write(`FAIL ${name}: ${error}\n`);
  }
}

const outPath = path.join(deployDir, '_deploy-results-wave.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
