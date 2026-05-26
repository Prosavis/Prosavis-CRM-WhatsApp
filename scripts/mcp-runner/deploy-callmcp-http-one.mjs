/**
 * Despliega una función leyendo _callmcp-args-{name}.json vía MCP HTTP (mcp.supabase.com).
 * Token: argv[3] o SUPABASE_ACCESS_TOKEN
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');
const runner = path.join(__dirname, 'deploy-callmcp-wave-a-runner.mjs');
const repoRoot = path.resolve(__dirname, '..', '..');

const name = process.argv[2]?.trim();
const token = (process.argv[3] ?? process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();

if (!name) {
  console.error('Uso: node deploy-callmcp-http-one.mjs <function-name> [token]');
  process.exit(1);
}

if (!token) {
  console.log(JSON.stringify({ name, error: 'NO_TOKEN', needCallMcpTool: true }));
  process.exit(2);
}

const src = path.join(deployDir, `_callmcp-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(src, 'utf8'));

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});

const client = new Client({ name: 'deploy-http-one', version: '1.0.0' }, { capabilities: {} });

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
  let entry;
  if (parsed?.error) {
    entry = { name, error: parsed.error.message ?? String(parsed.error) };
  } else if (parsed?.version != null) {
    entry = { name, version: parsed.version };
  } else {
    entry = { name, error: text.slice(0, 500) || 'deploy sin version' };
  }
  const { spawnSync } = await import('child_process');
  spawnSync(process.execPath, [runner, 'record', JSON.stringify(entry)], {
    stdio: 'inherit',
    cwd: repoRoot,
  });
  console.log(JSON.stringify(entry));
  process.exit(entry.error ? 1 : 0);
} catch (err) {
  const entry = { name, error: String(err.message ?? err) };
  const { spawnSync } = await import('child_process');
  spawnSync(process.execPath, [runner, 'record', JSON.stringify(entry)], {
    stdio: 'inherit',
    cwd: repoRoot,
  });
  console.log(JSON.stringify(entry));
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
