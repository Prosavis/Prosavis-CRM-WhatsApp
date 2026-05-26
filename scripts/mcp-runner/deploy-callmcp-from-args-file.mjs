/**
 * Lee _callmcp-deploy-N-args.json y emite {name, version}|{name, error} vía MCP HTTP.
 * Token: argv[2] o SUPABASE_ACCESS_TOKEN en .env.secrets.local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');

function loadToken(explicit) {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const secretsPath = path.resolve(__dirname, '..', '..', '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function findCursorSupabaseToken() {
  const appData = process.env.APPDATA;
  if (!appData) return null;
  for (const root of [
    path.join(appData, 'Cursor', 'User', 'globalStorage'),
    path.join(appData, 'cursor', 'User', 'globalStorage'),
  ]) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.toLowerCase().includes('supabase')) continue;
      const dir = path.join(root, entry.name);
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = fs.readFileSync(path.join(dir, file), 'utf8');
          const m = raw.match(/sbp_[a-zA-Z0-9]+/);
          if (m) return m[0];
        } catch {
          // ignore
        }
      }
    }
  }
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
    return { name: args.name, error: parsed.error.message ?? String(parsed.error) };
  }
  if (parsed?.version != null) {
    return { name: args.name, version: parsed.version };
  }
  return { name: args.name, error: text.slice(0, 500) || 'deploy sin version' };
}

const argsPath = path.resolve(process.argv[2] ?? '');
const token = loadToken(process.argv[3]) ?? findCursorSupabaseToken();
const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));

if (!token) {
  console.log(
    JSON.stringify({
      name: args.name,
      error: 'No token; use CallMcpTool deploy_edge_function',
    }),
  );
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'deploy-callmcp-from-args', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  console.log(JSON.stringify(await deployOne(client, args)));
} catch (err) {
  console.log(JSON.stringify({ name: args.name, error: String(err.message ?? err) }));
} finally {
  await client.close().catch(() => {});
}
