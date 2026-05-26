/**
 * Lee _cursor-deploy-{name}.json y despliega vía MCP SDK (equiv. CallMcpTool deploy_edge_function).
 * Uso: node deploy-cursor-one-callmcp.mjs <function-name> [SUPABASE_ACCESS_TOKEN]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');
const name = process.argv[2];
const token = process.argv[3]?.trim() || process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!name) {
  console.error('Uso: node deploy-cursor-one-callmcp.mjs <function-name> [token]');
  process.exit(1);
}

const src = path.join(deployDir, `_cursor-deploy-${name}.json`);
const args = JSON.parse(fs.readFileSync(src, 'utf8'));

if (!token) {
  console.log(
    JSON.stringify({
      action: 'CallMcpTool',
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      arguments: args,
    }),
  );
  process.exit(0);
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

const client = new Client({ name: 'deploy-cursor-one', version: '1.0.0' }, { capabilities: {} });

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
