/**
 * Lee _callmcp-args-{name}.json y despliega vía MCP HTTP (deploy_edge_function).
 * Token: argv[2], SUPABASE_ACCESS_TOKEN o .env.secrets.local
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

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

function loadToken() {
  const fromArgv = process.argv[2]?.trim();
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

async function deployOne(client, args) {
  const response = await client.callTool({ name: 'deploy_edge_function', arguments: args });
  const text = response.content?.find((c) => c.type === 'text')?.text ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (parsed?.error) {
    return { name: args.name, error: parsed.error.message ?? String(parsed.error) };
  }
  if (parsed?.version != null) {
    return { name: args.name, version: parsed.version };
  }
  return { name: args.name, error: text.slice(0, 500) || 'deploy sin version' };
}

const token = loadToken();
if (!token) {
  console.log(JSON.stringify({ needCallMcpTool: true, order: ORDER }));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'plugin-loop', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  for (const fn of ORDER) {
    const args = JSON.parse(
      fs.readFileSync(path.join(deployDir, `_callmcp-args-${fn}.json`), 'utf8'),
    );
    process.stderr.write(`Deploy ${fn} (${args.files.length} files)...\n`);
    try {
      const entry = await deployOne(client, args);
      record(entry);
      process.stderr.write(`${entry.version != null ? 'OK' : 'ERR'} ${fn}\n`);
    } catch (err) {
      record({ name: fn, error: String(err.message ?? err) });
    }
  }
} finally {
  await client.close().catch(() => {});
}

const summary = spawnSync(process.execPath, [runner, 'summary'], { encoding: 'utf8', cwd: repoRoot });
process.stdout.write(summary.stdout ?? '{}');
