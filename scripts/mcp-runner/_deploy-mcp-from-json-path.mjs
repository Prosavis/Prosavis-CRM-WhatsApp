/**
 * Despliega leyendo args JSON vía MCP HTTP (token) o indica CallMcpTool.
 * Uso: node _deploy-mcp-from-json-path.mjs <args.json> [sbp_token]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appendScript = path.join(__dirname, '..', '.edge-deploy', '_append-deploy-result.mjs');

function loadToken(explicit) {
  if (explicit?.trim()?.startsWith('sbp_')) return explicit.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()?.startsWith('sbp_')) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  return null;
}

const argsPath = path.resolve(process.argv[2] ?? '');
const token = loadToken(process.argv[3]);

if (!argsPath || !fs.existsSync(argsPath)) {
  console.error('Uso: node _deploy-mcp-from-json-path.mjs <args.json> [sbp_token]');
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));

if (!token) {
  console.log(
    JSON.stringify({
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      name: args.name,
      files: args.files.length,
      argsPath,
    }),
  );
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'deploy-mcp-from-json-path', version: '1.0.0' }, { capabilities: {} });

let entry;
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
    entry = { name: args.name, error: parsed.error.message ?? String(parsed.error) };
  } else if (parsed?.version != null) {
    entry = { name: args.name, version: parsed.version };
  } else {
    entry = { name: args.name, error: text.slice(0, 500) || 'deploy sin version' };
  }
} catch (err) {
  entry = { name: args.name, error: String(err.message ?? err) };
} finally {
  await client.close().catch(() => {});
}

spawnSync(process.execPath, [appendScript, JSON.stringify(entry)], { stdio: 'inherit' });
console.log(JSON.stringify(entry));
process.exit(entry.version != null ? 0 : 1);
