/**
 * Despliega wave A: lee _cursor-deploy-*.json y llama deploy_edge_function vía MCP HTTP
 * usando el token OAuth almacenado por el plugin Supabase de Cursor (si existe).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');

const NAMES = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

function findCursorSupabaseToken() {
  const candidates = [
    process.env.SUPABASE_ACCESS_TOKEN,
    process.env.SB_ACCESS_TOKEN,
  ].filter(Boolean);
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
      const dir = path.join(root, entry.name);
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        try {
          const raw = fs.readFileSync(path.join(dir, file), 'utf8');
          if (/sbp_[a-zA-Z0-9]+/.test(raw)) {
            const m = raw.match(/sbp_[a-zA-Z0-9]+/);
            if (m) return m[0];
          }
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

async function deployOne(args, transport) {
  const client = new Client({ name: 'deploy-wave-a', version: '1.0.0' }, { capabilities: {} });
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

const token = findCursorSupabaseToken();
const results = [];

if (!token) {
  for (const name of NAMES) {
    results.push({ name, error: 'No token; use CallMcpTool deploy_edge_function' });
  }
  console.log(JSON.stringify(results));
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
});

for (const name of NAMES) {
  const src = path.join(deployDir, `_cursor-deploy-${name}.json`);
  if (!fs.existsSync(src)) {
    results.push({ name, error: `missing ${src}` });
    continue;
  }
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  process.stderr.write(`Deploy ${name} (${args.files.length} files)...\n`);
  try {
    results.push(await deployOne(args, transport));
  } catch (err) {
    results.push({ name, error: String(err.message ?? err) });
  }
}

console.log(JSON.stringify(results));
process.exit(results.some((r) => r.error) ? 1 : 0);
