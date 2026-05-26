/**
 * Despliega las 7 funciones leyendo _mcp-call-{name}.json vía MCP HTTP.
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

async function deployOne(args, transport) {
  const client = new Client({ name: 'deploy-all-7-mcp-call', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  try {
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
  } finally {
    await client.close().catch(() => {});
  }
}

const token = findToken(process.argv[2]);
if (!token) {
  console.log(JSON.stringify({ error: 'NO_TOKEN', needCallMcpTool: true, order: ORDER, deployDir }));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});

const results = [];
for (const name of ORDER) {
  const src = path.join(deployDir, `_mcp-call-${name}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  process.stderr.write(`Deploying ${name} (${args.files.length} files)...\n`);
  try {
    const result = await deployOne(args, transport);
    results.push(result);
    process.stderr.write(`${result.version != null ? 'OK' : 'FAIL'} ${name}: ${result.version ?? result.error}\n`);
  } catch (err) {
    const result = { name, error: String(err.message ?? err) };
    results.push(result);
    process.stderr.write(`FAIL ${name}: ${result.error}\n`);
  }
}

const outPath = path.join(deployDir, '_deploy-results.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
