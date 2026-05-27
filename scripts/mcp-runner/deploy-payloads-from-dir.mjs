/**
 * Lee payloads JSON (con BOM strip en .ts) y despliega vía MCP HTTP.
 * Uso: node deploy-payloads-from-dir.mjs [token]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const payloadDir = path.resolve(repoRoot, '.cursor/edge-mcp-args');

const ORDER = [
  'get-whatsapp-media-url',
  'on-whatsapp-webhook',
  'send-whatsapp-chat-message',
  'send-whatsapp-media-batch',
];

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

async function deployOne(client, args) {
  const response = await client.callTool({
    name: 'deploy_edge_function',
    arguments: args,
  });
  const text = response.content?.find((c) => c.type === 'text')?.text ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (parsed?.error) {
    return {
      name: args.name,
      ok: false,
      error: parsed.error.message ?? String(parsed.error),
    };
  }
  if (parsed?.version != null) {
    return {
      name: args.name,
      ok: true,
      version: parsed.version,
      slug: parsed.slug ?? args.name,
    };
  }
  return { name: args.name, ok: false, error: text.slice(0, 800) || 'deploy sin version' };
}

const token = loadToken(process.argv[2]);
if (!token) {
  console.log(JSON.stringify({ needCallMcpTool: true, order: ORDER, payloadDir }));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(
  new URL('https://mcp.supabase.com/mcp'),
  { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
);
const client = new Client({ name: 'deploy-payloads-dir', version: '1.0.0' }, { capabilities: {} });
const results = [];

try {
  await client.connect(transport);
  for (const slug of ORDER) {
    const src = path.join(payloadDir, `${slug}.json`);
    const args = JSON.parse(fs.readFileSync(src, 'utf8'));
    process.stderr.write(`Deploy ${slug} (${args.files?.length ?? 0} files)...\n`);
    try {
      results.push(await deployOne(client, args));
    } catch (err) {
      results.push({ name: slug, ok: false, error: String(err.message ?? err) });
    }
  }
} finally {
  await client.close().catch(() => {});
}

console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
