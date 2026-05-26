/**
 * Despliega _invoke-{index}.json vía MCP SDK deploy_edge_function (equiv. CallMcpTool).
 * Uso: node deploy-callmcp-invoke-call-from-json-path.mjs <invoke-index> [token]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');
const idx = Number(process.argv[2]);
const token = process.argv[3]?.trim() || process.env.SUPABASE_ACCESS_TOKEN?.trim();

const invokePath = path.join(deployDir, `_invoke-${idx}.json`);
const args = JSON.parse(fs.readFileSync(invokePath, 'utf8'));

if (!token) {
  console.log(JSON.stringify({ name: args.name, error: 'SUPABASE_ACCESS_TOKEN no está definido.' }));
  process.exit(2);
}

const mcpEntry = path.join(
  __dirname,
  'mcp-runner',
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

const client = new Client({ name: 'invoke-deploy-one', version: '1.0.0' }, { capabilities: {} });

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
    console.log(JSON.stringify({ name: args.name, error: parsed.error.message ?? String(parsed.error) }));
  } else if (parsed?.version != null) {
    console.log(JSON.stringify({ name: args.name, version: parsed.version }));
  } else {
    console.log(JSON.stringify({ name: args.name, error: text.slice(0, 500) || 'deploy sin version' }));
  }
} catch (err) {
  console.log(JSON.stringify({ name: args.name, error: String(err.message ?? err) }));
} finally {
  await client.close().catch(() => {});
}
