/**
 * Despliega una función leyendo _callmcp-args-{name}.json vía MCP HTTP.
 * Token: argv[3], SUPABASE_ACCESS_TOKEN, o .env.secrets.local
 * Sin token: exit 2 (usar CallMcpTool en Cursor).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');
const repoRoot = path.resolve(__dirname, '..', '..');
const runner = path.join(__dirname, 'deploy-callmcp-wave-a-runner.mjs');

function loadToken() {
  const fromArgv = process.argv[3]?.trim();
  if (fromArgv) return fromArgv;
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const secretsPath = path.join(repoRoot, '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function record(entry) {
  spawnSync(process.execPath, [runner, 'record', JSON.stringify(entry)], {
    stdio: 'inherit',
    cwd: repoRoot,
  });
}

const name = process.argv[2]?.trim();
if (!name) {
  console.error('Uso: node deploy-callmcp-cursor-deploy-one.mjs <function-name> [token]');
  process.exit(1);
}

const src = path.join(deployDir, `_callmcp-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(src, 'utf8'));

const token = loadToken();
if (!token) {
  console.log(JSON.stringify({ needCallMcpTool: true, name, argsPath: src }));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});

const client = new Client({ name: 'cursor-deploy-one', version: '1.0.0' }, { capabilities: {} });

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
  record(entry);
  console.log(JSON.stringify(entry));
  process.exit(entry.version != null ? 0 : 1);
} catch (err) {
  const entry = { name, error: String(err.message ?? err) };
  record(entry);
  console.log(JSON.stringify(entry));
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
