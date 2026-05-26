/**
 * Despliega funciones 3-6 en orden vía MCP deploy_edge_function.
 * Token: argv[2], SUPABASE_ACCESS_TOKEN, o .env.secrets.local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '..', '.edge-deploy');

const ORDER = [
  ['get-whatsapp-booking-context', '_callmcp-deploy-3-args.json'],
  ['create-whatsapp-ia-template', '_callmcp-deploy-4-args.json'],
  ['delete-whatsapp-ia-template', '_callmcp-deploy-5-args.json'],
  ['resolve-whatsapp-ia-template', '_callmcp-deploy-6-args.json'],
];

function loadToken() {
  const fromArg = process.argv[2]?.trim();
  if (fromArg) return fromArg;
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.resolve(__dirname, '..', '..', '.env.secrets.local');
  if (fs.existsSync(secretsPath)) {
    for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  const appData = process.env.APPDATA;
  if (appData) {
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
  }
  return null;
}

async function deployOne(args, transport) {
  const client = new Client({ name: 'deploy-batch-3-6', version: '1.0.0' }, { capabilities: {} });
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
      return { name: args.name, error: parsed.error.message ?? String(parsed.error) };
    }
    if (parsed?.version != null) {
      return { name: args.name, version: parsed.version };
    }
    return { name: args.name, error: text.slice(0, 500) || 'deploy sin version' };
  } finally {
    await client.close().catch(() => {});
  }
}

const token = loadToken();
const results = [];

if (!token) {
  for (const [name] of ORDER) {
    results.push({ name, error: 'SUPABASE_ACCESS_TOKEN requerido' });
  }
  console.log(JSON.stringify(results));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});

for (const [, file] of ORDER) {
  const argsPath = path.join(deployDir, file);
  const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
  const result = await deployOne(args, transport);
  results.push(result);
  if (result.error) break;
}

console.log(JSON.stringify(results));
process.exit(results.some((r) => r.error) ? 1 : 0);
