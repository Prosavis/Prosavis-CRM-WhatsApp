/**
 * Despliega las 7 funciones leyendo _mcp-call-{name}.json vía MCP SDK (stdio).
 * Requiere SUPABASE_ACCESS_TOKEN en el entorno.
 * Uso: node scripts/mcp-deploy-all-sdk.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');

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
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.resolve(__dirname, '..', '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const token = loadToken();
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN no está definido.');
  process.exit(2);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [
    path.join(__dirname, 'node_modules', '@supabase', 'mcp-server-supabase', 'dist', 'index.js'),
  ],
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
});

const client = new Client({ name: 'prosavis-deploy', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);

const results = [];
for (const name of ORDER) {
  const src = path.join(deployDir, `_mcp-call-${name}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
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
      parsed = { raw: text };
    }
    const version = parsed?.version ?? parsed?.data?.version ?? null;
    if (version != null) {
      results.push({ name, version });
    } else {
      results.push({ name, error: text.slice(0, 500) || 'deploy sin version' });
    }
  } catch (err) {
    results.push({ name, error: String(err.message ?? err) });
  }
}

await client.close();
const outPath = path.join(deployDir, '_deploy-results.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
