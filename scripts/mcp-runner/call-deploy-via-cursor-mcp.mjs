/**
 * Lee callmcp-args-*.json y despliega con deploy_edge_function vía MCP HTTP (token argv[2]).
 * Sin token: imprime rutas para CallMcpTool en Cursor.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentTools = path.resolve(
  __dirname,
  '../../../.cursor/projects/c-Users-Prosavis-Documents-GitHub-Prosavis-App/agent-tools',
);
const payloadDir = path.resolve(__dirname, '../.edge-deploy-payloads');

const SLUGS = [
  'get-whatsapp-media-url',
  'on-whatsapp-webhook',
  'send-whatsapp-chat-message',
  'send-whatsapp-media-batch',
];

function loadArgs(slug) {
  const fromAgent = path.join(agentTools, `callmcp-args-${slug}.json`);
  const fromPayload = path.join(payloadDir, `${slug}.json`);
  const file = fs.existsSync(fromAgent) ? fromAgent : fromPayload;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.files = (raw.files ?? []).map((f) => ({
    name: f.name,
    content: String(f.content ?? '').replace(/^\uFEFF/, ''),
  }));
  return raw;
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
    return { slug: args.name, ok: false, error: parsed.error.message ?? String(parsed.error) };
  }
  if (parsed?.version != null) {
    return { slug: args.name, ok: true, version: parsed.version };
  }
  return { slug: args.name, ok: false, error: text.slice(0, 400) || 'sin version en respuesta' };
}

const token = (process.argv[2] ?? process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();
const results = [];

if (!token) {
  for (const slug of SLUGS) {
    results.push({
      slug,
      ok: false,
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      argsFile: path.join(agentTools, `callmcp-args-${slug}.json`),
    });
  }
  console.log(JSON.stringify({ needCallMcpTool: true, results }, null, 2));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'call-deploy-batch', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  for (const slug of SLUGS) {
    const args = loadArgs(slug);
    process.stderr.write(`Deploy ${slug} (${args.files.length} files)...\n`);
    try {
      results.push(await deployOne(client, args));
    } catch (err) {
      results.push({ slug, ok: false, error: String(err.message ?? err) });
    }
  }
} finally {
  await client.close().catch(() => {});
}

console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
