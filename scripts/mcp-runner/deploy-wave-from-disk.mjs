/**
 * Despliega oleada A/B leyendo _mcp-call-*.json vía MCP HTTP (OAuth token).
 * Uso: node deploy-wave-from-disk.mjs a [SUPABASE_ACCESS_TOKEN]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '..', '.edge-deploy');
const root = path.resolve(__dirname, '..', '..');

const WAVES = {
  a: [
    'suggest-whatsapp-agent-reply',
    'generate-whatsapp-ia-template',
    'transcribe-whatsapp-inbound-audio',
    'get-whatsapp-booking-context',
    'create-whatsapp-ia-template',
    'delete-whatsapp-ia-template',
    'resolve-whatsapp-ia-template',
  ],
};

function loadToken(argvToken) {
  if (argvToken?.trim()) return argvToken.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const secretsPath = path.join(root, '.env.secrets.local');
  if (fs.existsSync(secretsPath)) {
    for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

const wave = process.argv[2] ?? 'a';
const token = loadToken(process.argv[3]);
const names = WAVES[wave];
if (!names) {
  console.error('Oleada desconocida:', wave);
  process.exit(1);
}

if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN requerido');
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'deploy-wave-from-disk', version: '1.0.0' }, { capabilities: {} });

const results = [];
try {
  await client.connect(transport);
  for (const name of names) {
    const src = path.join(deployDir, `_mcp-call-${name}.json`);
    const args = JSON.parse(fs.readFileSync(src, 'utf8'));
    process.stderr.write(`Deploying ${name}...\n`);
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
        results.push({ name, error: parsed.error.message ?? String(parsed.error) });
      } else if (parsed?.version != null) {
        results.push({ name, version: parsed.version });
      } else {
        results.push({ name, error: text.slice(0, 500) || 'deploy sin version' });
      }
    } catch (err) {
      results.push({ name, error: String(err.message ?? err) });
    }
  }
} finally {
  await client.close().catch(() => {});
}

const outPath = path.join(deployDir, `_deploy-results-wave-${wave}.json`);
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => r.error) ? 1 : 0);
