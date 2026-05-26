/**
 * Despliega las 7 funciones leyendo _mcp-call-{name}.json vía MCP HTTP OAuth.
 * Ejecutar desde scripts/mcp-runner con token en argv[2] o SUPABASE_ACCESS_TOKEN.
 * Sin token: exit 2 (usar CallMcpTool OAuth del plugin).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

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

async function deployOne(client, args) {
  const response = await client.callTool({ name: 'deploy_edge_function', arguments: args });
  const text = response.content?.find((c) => c.type === 'text')?.text ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (parsed?.error) {
    return { name: args.name, error: parsed.error.message ?? String(parsed.error) };
  }
  if (parsed?.version != null) {
    return { name: args.name, version: parsed.version };
  }
  return { name: args.name, error: text.slice(0, 500) || 'deploy sin version' };
}

const token = loadToken(process.argv[2]);
if (!token) {
  console.log(JSON.stringify({ needCallMcpTool: true, order: ORDER, deployDir }));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'deploy-all-callmcp', version: '1.0.0' }, { capabilities: {} });
const results = [];

try {
  await client.connect(transport);
  for (const name of ORDER) {
    const src = path.join(deployDir, `_mcp-call-${name}.json`);
    const args = JSON.parse(fs.readFileSync(src, 'utf8'));
    process.stderr.write(`Deploy ${name} (${args.files.length} files)...\n`);
    try {
      const entry = await deployOne(client, args);
      results.push(entry);
      process.stderr.write(`${entry.version != null ? 'OK' : 'ERR'} ${name} ${entry.version ?? entry.error}\n`);
    } catch (err) {
      results.push({ name, error: String(err.message ?? err) });
    }
  }
} finally {
  await client.close().catch(() => {});
}

fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
