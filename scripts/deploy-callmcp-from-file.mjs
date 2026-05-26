/**
 * Lee _mcp-call-{name}.json y despliega vía MCP SDK (mismo tool deploy_edge_function).
 * Token: SUPABASE_ACCESS_TOKEN o .env.secrets.local
 * Uso: node scripts/deploy-callmcp-from-file.mjs <function-name>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');

function loadToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.resolve(__dirname, '..', '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const name = process.argv[2];
if (!name) {
  console.error('Uso: node deploy-callmcp-from-file.mjs <function-name>');
  process.exit(1);
}

const src = path.join(deployDir, `_mcp-call-${name}.json`);
const args = JSON.parse(fs.readFileSync(src, 'utf8'));

const token = loadToken();
if (!token) {
  console.log(JSON.stringify({ name, error: 'SUPABASE_ACCESS_TOKEN no está definido.' }));
  process.exit(2);
}

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
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
});

const client = new Client({ name: 'prosavis-deploy-one', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
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
    console.log(JSON.stringify({ name, error: parsed.error.message ?? String(parsed.error) }));
  } else if (parsed?.version != null) {
    console.log(JSON.stringify({ name, version: parsed.version }));
  } else {
    console.log(JSON.stringify({ name, error: text.slice(0, 500) || 'deploy sin version' }));
  }
} catch (err) {
  console.log(JSON.stringify({ name, error: String(err.message ?? err) }));
} finally {
  await client.close().catch(() => {});
}
