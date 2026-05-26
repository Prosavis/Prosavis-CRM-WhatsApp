/**
 * Despliega una función leyendo _mcp-call-{name}.json vía MCP HTTP o prepara args para CallMcpTool.
 * Ejecutar desde scripts/mcp-runner.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');
const repoRoot = path.resolve(__dirname, '..', '..');

function findToken(explicit) {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const secretsPath = path.join(repoRoot, '.env.secrets.local');
  if (fs.existsSync(secretsPath)) {
    for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  const appData = process.env.APPDATA;
  const roots = [
    path.join(appData, 'Cursor', 'User', 'globalStorage'),
    path.join(appData, 'cursor', 'User', 'globalStorage'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.toLowerCase().includes('supabase')) continue;
      const storageDir = path.join(root, entry.name);
      for (const file of fs.readdirSync(storageDir)) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = fs.readFileSync(path.join(storageDir, file), 'utf8');
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

const name = process.argv[2]?.trim();
if (!name) {
  console.error('Uso: node deploy-one-from-mcp-call-json.mjs <function-name> [token]');
  process.exit(1);
}

const src = path.join(deployDir, `_mcp-call-${name}.json`);
const args = JSON.parse(fs.readFileSync(src, 'utf8'));
const token = findToken(process.argv[3]);

if (!token) {
  const out = path.join(deployDir, '_callmcp-next-args.json');
  fs.writeFileSync(out, JSON.stringify(args));
  console.log(JSON.stringify({ needCallMcpTool: true, name, files: args.files.length, argsPath: out }));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'deploy-one-from-mcp-call-json', version: '1.0.0' }, { capabilities: {} });

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
    console.log(JSON.stringify({ name, error: parsed.error.message ?? String(parsed.error) }));
    process.exit(1);
  }
  if (parsed?.version != null) {
    console.log(JSON.stringify({ name, version: parsed.version }));
    process.exit(0);
  }
  console.log(JSON.stringify({ name, error: text.slice(0, 500) || 'deploy sin version' }));
  process.exit(1);
} catch (err) {
  console.log(JSON.stringify({ name, error: String(err.message ?? err) }));
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
