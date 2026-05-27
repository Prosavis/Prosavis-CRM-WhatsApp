/**
 * Despliega payloads JSON vía MCP HTTP deploy_edge_function.
 * Uso: node deploy-payloads-via-mcp-http.mjs [token] [payload.json ...]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const defaultPayloadDir = path.join(repoRoot, 'scripts', '.edge-deploy-payloads');

const DEFAULT_SLUGS = [
  'get-whatsapp-media-url',
  'on-whatsapp-webhook',
  'send-whatsapp-chat-message',
  'send-whatsapp-media-batch',
];

function loadToken(explicit) {
  if (explicit?.trim() && !explicit.endsWith('.json')) return explicit.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.join(repoRoot, '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  const appData = process.env.APPDATA;
  if (!appData) return null;
  const root = path.join(appData, 'Cursor', 'User', 'globalStorage');
  if (!fs.existsSync(root)) return null;
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
  return null;
}

function loadArgs(jsonPath) {
  const args = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  args.files = (args.files ?? []).map((f) => ({
    name: f.name,
    content: String(f.content ?? '').replace(/^\uFEFF/, ''),
  }));
  return args;
}

const argv = process.argv.slice(2);
let token = null;
const payloadPaths = [];

for (const arg of argv) {
  if (!token && (arg.startsWith('sbp_') || arg.length > 40)) {
    token = arg;
    continue;
  }
  if (arg.endsWith('.json')) {
    payloadPaths.push(path.resolve(arg));
  }
}

if (!token) token = loadToken(argv[0]);

if (payloadPaths.length === 0) {
  for (const slug of DEFAULT_SLUGS) {
    payloadPaths.push(path.join(defaultPayloadDir, `${slug}.json`));
  }
}

if (!token) {
  console.log(
    JSON.stringify({
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      payloadPaths,
    }),
  );
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(
  new URL('https://mcp.supabase.com/mcp'),
  { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
);
const client = new Client({ name: 'deploy-payloads-http', version: '1.0.0' }, { capabilities: {} });
const results = [];

try {
  await client.connect(transport);
  for (const payloadPath of payloadPaths) {
    if (!fs.existsSync(payloadPath)) {
      results.push({ payloadPath, ok: false, error: 'Archivo no encontrado' });
      continue;
    }
    const args = loadArgs(payloadPath);
    try {
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
        results.push({
          name: args.name,
          ok: false,
          error: parsed.error.message ?? String(parsed.error),
        });
      } else {
        results.push({
          name: args.name,
          ok: true,
          version: parsed?.version ?? null,
          slug: parsed?.slug ?? args.name,
        });
      }
    } catch (err) {
      results.push({ name: args.name, ok: false, error: String(err.message ?? err) });
    }
  }
} finally {
  await client.close().catch(() => {});
}

console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
