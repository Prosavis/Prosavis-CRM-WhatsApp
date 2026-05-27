/**
 * Lee agent-tools/mcp-invoke-{slug}.json y despliega vía deploy_edge_function (MCP HTTP).
 * Token: argv[2] o SUPABASE_ACCESS_TOKEN.
 * Sin token: imprime needCallMcpTool y rutas para CallMcpTool en Cursor.
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

const SLUGS = [
  'get-whatsapp-media-url',
  'on-whatsapp-webhook',
  'send-whatsapp-chat-message',
  'send-whatsapp-media-batch',
];

function findToken(explicit) {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
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
    return { slug: args.name, ok: false, error: parsed.error.message ?? String(parsed.error) };
  }
  if (parsed?.version != null) {
    return { slug: args.name, ok: true, version: parsed.version };
  }
  return { slug: args.name, ok: false, error: text.slice(0, 500) || 'deploy sin version' };
}

const token = findToken(process.argv[2]);
const results = [];

if (!token) {
  for (const slug of SLUGS) {
    const argsPath = path.join(agentTools, `mcp-invoke-${slug}.json`);
    results.push({
      slug,
      ok: false,
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      argsPath,
      bytes: fs.existsSync(argsPath) ? fs.statSync(argsPath).size : 0,
    });
  }
  console.log(JSON.stringify({ needCallMcpTool: true, results }, null, 2));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'deploy-all-mcp-invoke', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  for (const slug of SLUGS) {
    const argsPath = path.join(agentTools, `mcp-invoke-${slug}.json`);
    const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
    process.stderr.write(`Deploy ${slug} (${args.files?.length ?? 0} files)...\n`);
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
