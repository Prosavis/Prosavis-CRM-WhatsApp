/**
 * Despliega Edge Functions leyendo payloads _ready-*.json vía MCP HTTP (requiere token).
 * Sin token: escribe instrucciones CallMcpTool por función.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_TOOLS =
  'C:/Users/Prosavis/.cursor/projects/c-Users-Prosavis-Documents-GitHub-Prosavis-App/agent-tools';
const SLUGS = [
  'get-whatsapp-media-url',
  'on-whatsapp-webhook',
  'send-whatsapp-chat-message',
  'send-whatsapp-media-batch',
];

function findToken(explicit) {
  if (explicit?.trim()) return explicit.trim();
  for (const k of ['SUPABASE_ACCESS_TOKEN', 'SB_ACCESS_TOKEN']) {
    if (process.env[k]?.trim()) return process.env[k].trim();
  }
  return null;
}

async function deployOne(client, argsPath) {
  const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
  const response = await client.callTool({ name: 'deploy_edge_function', arguments: args });
  const text = response.content?.find((c) => c.type === 'text')?.text ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (parsed?.error) {
    return { name: args.name, ok: false, error: parsed.error.message ?? String(parsed.error) };
  }
  return {
    name: args.name,
    ok: true,
    version: parsed?.version ?? parsed?.id ?? null,
    slug: parsed?.slug ?? args.name,
    status: parsed?.status ?? null,
    raw: parsed,
  };
}

const token = findToken(process.argv[2]);
const results = [];

if (!token) {
  for (const slug of SLUGS) {
    const argsPath = path.join(AGENT_TOOLS, `_ready-${slug}.json`);
    const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
    results.push({
      slug,
      action: 'CallMcpTool',
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      arguments: args,
      argsPath,
    });
  }
  console.log(JSON.stringify({ needCallMcpTool: true, results }, null, 0));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'deploy-four-ready', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  for (const slug of SLUGS) {
    const argsPath = path.join(AGENT_TOOLS, `_ready-${slug}.json`);
    results.push(await deployOne(client, argsPath));
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: String(e), results }));
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
