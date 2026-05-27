/**
 * Despliega 4 payloads vía MCP HTTP (requiere SUPABASE_ACCESS_TOKEN).
 * Sin token: imprime instrucciones CallMcpTool por función y exit 2.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const payloadDir = path.join(repoRoot, 'scripts', '.edge-deploy-payloads');

const NAMES = [
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

const token = loadToken(process.argv[2]);
const results = [];

if (!token) {
  for (const name of NAMES) {
    const payloadPath = path.join(payloadDir, `${name}.json`);
    results.push({
      name,
      ok: false,
      needCallMcpTool: true,
      payloadPath,
      exists: fs.existsSync(payloadPath),
    });
  }
  console.log(JSON.stringify({ needCallMcpTool: true, results }, null, 2));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(
  new URL('https://mcp.supabase.com/mcp'),
  { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
);
const client = new Client({ name: 'deploy-four-callmcp', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  for (const name of NAMES) {
    const payloadPath = path.join(payloadDir, `${name}.json`);
    if (!fs.existsSync(payloadPath)) {
      results.push({ name, ok: false, error: `Missing ${payloadPath}` });
      continue;
    }
    const args = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    try {
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
        results.push({
          name,
          ok: false,
          error: parsed.error.message ?? String(parsed.error),
        });
      } else {
        results.push({
          name,
          ok: true,
          version: parsed?.version ?? null,
          slug: parsed?.slug ?? name,
        });
      }
    } catch (err) {
      results.push({ name, ok: false, error: String(err.message ?? err) });
    }
  }
} finally {
  await client.close().catch(() => {});
}

console.log(JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
process.exit(failed.length ? 1 : 0);
