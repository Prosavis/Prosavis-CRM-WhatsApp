/**
 * Despliega las 7 funciones desde _cursor-deploy-{name}.json vía MCP HTTP.
 * Token: argv[2], SUPABASE_ACCESS_TOKEN, o globalStorage de Cursor (sbp_*).
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
          const parsed = JSON.parse(raw);
          const token =
            parsed?.access_token ??
            parsed?.accessToken ??
            parsed?.token ??
            parsed?.SUPABASE_ACCESS_TOKEN;
          if (typeof token === 'string' && token.startsWith('sbp_')) return token.trim();
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

const token = findCursorSupabaseToken(process.argv[2]);
const outPath = path.join(deployDir, '_deploy-results.json');

if (!token) {
  console.log(JSON.stringify({ error: 'No token; use CallMcpTool deploy_edge_function' }));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});

const client = new Client({ name: 'deploy-all-7-cursor', version: '1.0.0' }, { capabilities: {} });
const results = [];

try {
  await client.connect(transport);
  for (const name of ORDER) {
    const src = path.join(deployDir, `_cursor-deploy-${name}.json`);
    const args = JSON.parse(fs.readFileSync(src, 'utf8'));
    process.stderr.write(`Deploying ${name} (${args.files.length} files)...\n`);
    try {
      results.push(await deployOne(client, args));
    } catch (err) {
      results.push({ name, error: String(err.message ?? err) });
    }
  }
} catch (err) {
  console.log(JSON.stringify({ error: String(err.message ?? err), partial: results }));
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}

fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
