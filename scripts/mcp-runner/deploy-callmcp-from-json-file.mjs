/**
 * Lee un JSON de deploy (stdout) y llama deploy_edge_function vía MCP HTTP.
 * Uso: node deploy-callmcp-from-json-file.mjs <path-to-args.json> [token]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findCursorSupabaseToken(explicit) {
  if (explicit?.trim()) return explicit.trim();
  const candidates = [process.env.SUPABASE_ACCESS_TOKEN, process.env.SB_ACCESS_TOKEN].filter(
    Boolean,
  );
  if (candidates.length) return String(candidates[0]).trim();

  const appData = process.env.APPDATA;
  if (!appData) return null;
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

const jsonPath = process.argv[2];
const token = findCursorSupabaseToken(process.argv[3]);
if (!jsonPath) {
  console.error('Uso: node deploy-callmcp-from-json-file.mjs <args.json> [token]');
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

if (!token) {
  console.log(JSON.stringify({ action: 'CallMcpTool', server: 'plugin-supabase-supabase', toolName: 'deploy_edge_function', arguments: args }));
  process.exit(0);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});

const client = new Client({ name: 'deploy-from-json', version: '1.0.0' }, { capabilities: {} });

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
    console.log(JSON.stringify({ name: args.name, error: parsed.error.message ?? String(parsed.error) }));
    process.exit(1);
  }
  if (parsed?.version != null) {
    console.log(JSON.stringify({ name: args.name, version: parsed.version }));
    process.exit(0);
  }
  console.log(JSON.stringify({ name: args.name, error: text.slice(0, 500) || 'deploy sin version' }));
  process.exit(1);
} catch (err) {
  console.log(JSON.stringify({ name: args.name, error: String(err.message ?? err) }));
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
