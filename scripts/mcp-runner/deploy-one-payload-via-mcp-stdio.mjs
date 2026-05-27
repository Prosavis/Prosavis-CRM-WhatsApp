/**
 * Despliega un payload JSON vía MCP stdio deploy_edge_function (mismo tool que CallMcpTool).
 * Uso: node deploy-one-payload-via-mcp-stdio.mjs <ruta-payload.json> [token]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

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

const jsonPath = path.resolve(process.argv[2] ?? '');
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.log(JSON.stringify({ error: `Archivo no encontrado: ${jsonPath}` }));
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const token = loadToken(process.argv[3]);

async function deployViaHttp(tok) {
  const transport = new StreamableHTTPClientTransport(
    new URL('https://mcp.supabase.com/mcp'),
    { requestInit: { headers: { Authorization: `Bearer ${tok}` } } },
  );
  const client = new Client({ name: 'deploy-payload-http', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const response = await client.callTool({
      name: 'deploy_edge_function',
      arguments: args,
    });
    return response.content?.find((c) => c.type === 'text')?.text ?? '';
  } finally {
    await client.close().catch(() => {});
  }
}

async function deployViaStdio(tok) {
  const mcpEntry = path.join(
    __dirname,
    'node_modules',
    '@supabase',
    'mcp-server-supabase',
    'dist',
    'index.js',
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpEntry],
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: tok },
  });
  const client = new Client({ name: 'deploy-payload-stdio', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const response = await client.callTool({
      name: 'deploy_edge_function',
      arguments: args,
    });
    return response.content?.find((c) => c.type === 'text')?.text ?? '';
  } finally {
    await client.close().catch(() => {});
  }
}

if (!token) {
  console.log(
    JSON.stringify({
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      name: args.name,
      payloadPath: jsonPath,
    }),
  );
  process.exit(2);
}

let text = '';
try {
  text = await deployViaHttp(token);
} catch (httpErr) {
  try {
    text = await deployViaStdio(token);
  } catch (stdioErr) {
    console.log(
      JSON.stringify({
        name: args.name,
        ok: false,
        error: `HTTP: ${httpErr}; STDIO: ${stdioErr}`,
      }),
    );
    process.exit(1);
  }
}

let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = null;
}

if (parsed?.error) {
  console.log(
    JSON.stringify({
      name: args.name,
      ok: false,
      error: parsed.error.message ?? String(parsed.error),
    }),
  );
  process.exit(1);
}

if (parsed?.version != null || parsed?.slug) {
  console.log(
    JSON.stringify({
      name: args.name,
      ok: true,
      version: parsed.version ?? null,
      slug: parsed.slug ?? args.name,
    }),
  );
  process.exit(0);
}

console.log(
  JSON.stringify({
    name: args.name,
    ok: false,
    error: text.slice(0, 800) || 'deploy sin version',
  }),
);
process.exit(1);
