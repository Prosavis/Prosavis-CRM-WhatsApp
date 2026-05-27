/**
 * Despliega un payload usando MCP stdio (@supabase/mcp-server-supabase).
 * Token: SUPABASE_ACCESS_TOKEN en env o .env.secrets.local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

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

const jsonPath = path.resolve(process.argv[2] ?? '');
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.log(JSON.stringify({ ok: false, error: `No existe: ${jsonPath}` }));
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const token = loadToken();
if (!token) {
  console.log(JSON.stringify({ ok: false, needCallMcpTool: true, name: args.name }));
  process.exit(2);
}

const mcpEntry = path.join(__dirname, 'node_modules', '@supabase', 'mcp-server-supabase', 'dist', 'index.js');
if (!fs.existsSync(mcpEntry)) {
  console.log(JSON.stringify({ ok: false, error: 'npm install en scripts/mcp-runner' }));
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [mcpEntry],
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
});
const client = new Client({ name: 'deploy-one-stdio', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  const response = await client.callTool({ name: 'deploy_edge_function', arguments: args });
  const text = response.content?.find((c) => c.type === 'text')?.text ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (parsed?.error) {
    console.log(JSON.stringify({ name: args.name, ok: false, error: parsed.error.message ?? String(parsed.error) }));
    process.exit(1);
  }
  console.log(JSON.stringify({ name: args.name, ok: true, version: parsed?.version ?? null }));
} catch (err) {
  console.log(JSON.stringify({ name: args.name, ok: false, error: String(err.message ?? err) }));
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
