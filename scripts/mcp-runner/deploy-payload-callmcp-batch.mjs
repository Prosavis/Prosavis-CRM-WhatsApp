/**
 * Deploy all 4 edge function payloads via Supabase MCP HTTP.
 * Usage: node deploy-payload-callmcp-batch.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const payloadDir = path.join(repoRoot, 'scripts', '.edge-deploy-payloads');

const PAYLOADS = [
  'get-whatsapp-media-url.json',
  'on-whatsapp-webhook.json',
  'send-whatsapp-chat-message.json',
  'send-whatsapp-media-batch.json',
];

function loadToken() {
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

function readPayload(filename) {
  const raw = fs.readFileSync(path.join(payloadDir, filename), 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

const token = loadToken();
if (!token) {
  console.error(JSON.stringify({ ok: false, error: 'SUPABASE_ACCESS_TOKEN missing' }));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(
  new URL('https://mcp.supabase.com/mcp'),
  { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
);
const client = new Client({ name: 'deploy-payload-batch', version: '1.0.0' }, { capabilities: {} });

const results = [];

try {
  await client.connect(transport);
  for (const filename of PAYLOADS) {
    const args = readPayload(filename);
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
        parsed = { raw: text };
      }
      if (parsed?.error) {
        results.push({
          name: args.name,
          ok: false,
          error: parsed.error.message ?? JSON.stringify(parsed.error),
        });
      } else {
        results.push({
          name: args.name,
          ok: true,
          version: parsed?.version ?? null,
          slug: parsed?.slug ?? args.name,
        });
      }
    } catch (err) {
      results.push({
        name: args.name,
        ok: false,
        error: String(err.message ?? err),
      });
    }
  }
} finally {
  await client.close().catch(() => {});
}

for (const r of results) {
  console.log(JSON.stringify(r));
}
process.exit(results.some((r) => !r.ok) ? 1 : 0);
