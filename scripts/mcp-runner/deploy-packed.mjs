/**
 * Despliega funciones desde scripts/.edge-deploy/_mcp-call-{name}.json vía MCP Supabase.
 * Auth: token en argv[2], SUPABASE_ACCESS_TOKEN o Cursor MCP (stdio hereda env del plugin).
 *
 * Uso (desde repo root):
 *   node scripts/mcp-runner/deploy-packed.mjs suggest-whatsapp-agent-reply
 *   node scripts/mcp-runner/deploy-packed.mjs --wave a
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');

const WAVES = {
  a: [
    'suggest-whatsapp-agent-reply',
    'transcribe-whatsapp-inbound-audio',
    'get-whatsapp-booking-context',
  ],
  b: [
    'bulk-whatsapp-send',
    'send-whatsapp-template-message',
    'send-whatsapp-reaction',
    'send-whatsapp-media-batch',
    'block-whatsapp-user-admin',
    'list-whatsapp-message-templates',
    'send-whatsapp-chat-message',
    'mark-whatsapp-as-read',
    'list-whatsapp-snippets',
    'create-whatsapp-snippet',
    'update-whatsapp-snippet',
    'delete-whatsapp-snippet',
  ],
  c: [
    'list-whatsapp-stickers',
    'create-whatsapp-sticker',
    'update-whatsapp-sticker',
    'get-prosavis-cleaning-wompi-checkout-url',
    'delete-whatsapp-conversation-admin',
    'delete-whatsapp-message-log-entry',
    'get-whatsapp-business-profile',
    'update-whatsapp-business-profile',
    'patch-whatsapp-conversation',
    'on-whatsapp-webhook',
    'get-whatsapp-media-url',
    'get-whatsapp-media-signed-url',
    'ensure-whatsapp-conversation-from-lead',
    'purge-whatsapp-message-log',
    'get-whatsapp-metrics',
    'list-whatsapp-message-log',
  ],
};

function loadToken(argvToken) {
  if (argvToken?.trim()) return argvToken.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const secretsPath = path.resolve(__dirname, '..', '..', '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function resolveNames(argv) {
  const arg = argv[2];
  if (!arg) return [];
  if (arg === '--wave' && argv[3]) {
    const w = argv[3].toLowerCase();
    if (w === 'all') return [...WAVES.a, ...WAVES.b, ...WAVES.c];
    return WAVES[w] ?? [];
  }
  return [arg];
}

const names = resolveNames(process.argv);
if (!names.length) {
  console.error('Uso: deploy-packed.mjs <function-name> | --wave a|b|c|all [token]');
  process.exit(1);
}

const token = loadToken(process.argv.find((a) => a.startsWith('sbp_') || a.length > 40));
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN requerido para MCP stdio.');
  process.exit(2);
}

const mcpEntry = path.join(__dirname, 'node_modules', '@supabase', 'mcp-server-supabase', 'dist', 'index.js');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [mcpEntry],
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
});

const client = new Client({ name: 'deploy-packed', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

const results = [];
for (const name of names) {
  const src = path.join(deployDir, `_mcp-call-${name}.json`);
  if (!fs.existsSync(src)) {
    results.push({ name, error: 'missing _mcp-call json; empaqueta primero' });
    continue;
  }
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  process.stderr.write(`Deploy ${name} (${args.files.length} files)...\n`);
  try {
    const response = await client.callTool({ name: 'deploy_edge_function', arguments: args });
    const text = response.content?.find((c) => c.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text);
    if (parsed?.error) results.push({ name, error: parsed.error.message ?? parsed.error });
    else results.push({ name, version: parsed.version });
  } catch (err) {
    results.push({ name, error: String(err.message ?? err) });
  }
}

await client.close().catch(() => {});
console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => r.error) ? 1 : 0);
