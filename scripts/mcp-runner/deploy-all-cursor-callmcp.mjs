/**
 * Despliega las 7 funciones leyendo scripts/.edge-deploy/_cursor-deploy-{name}.json
 * vía MCP HTTP (deploy_edge_function). Token: argv[2] o SUPABASE_ACCESS_TOKEN.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

function findToken(explicit) {
  if (explicit?.trim()) return explicit.trim();
  for (const key of ['SUPABASE_ACCESS_TOKEN', 'SB_ACCESS_TOKEN']) {
    const v = process.env[key]?.trim();
    if (v) return v;
  }
  const appData = process.env.APPDATA;
  if (!appData) return null;
  const roots = [
    path.join(appData, 'Cursor', 'User', 'globalStorage'),
    path.join(appData, 'cursor', 'User', 'globalStorage'),
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = fs.readFileSync(path.join(dir, file), 'utf8');
          const m = raw.match(/sbp_[a-zA-Z0-9]{20,}/);
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

const token = findToken(process.argv[2]);
const outPath = path.join(deployDir, '_deploy-results.json');

if (!token) {
  const queue = ORDER.map((name) => ({
    name,
    argsFile: path.join(deployDir, `_cursor-deploy-${name}.json`),
  }));
  console.log(JSON.stringify({ mode: 'CallMcpTool', server: 'plugin-supabase-supabase', queue }));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'deploy-all-cursor', version: '1.0.0' }, { capabilities: {} });
const results = [];

try {
  await client.connect(transport);
  for (const name of ORDER) {
    const src = path.join(deployDir, `_cursor-deploy-${name}.json`);
    const args = JSON.parse(fs.readFileSync(src, 'utf8'));
    process.stderr.write(`Deploying ${name}...\n`);
    try {
      results.push(await deployOne(client, args));
    } catch (err) {
      results.push({ name, error: String(err.message ?? err) });
    }
  }
} finally {
  await client.close().catch(() => {});
}

fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
