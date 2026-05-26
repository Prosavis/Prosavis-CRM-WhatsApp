/**
 * Despliega las 7 funciones leyendo _mcp-call-{name}.json vía MCP SDK.
 * Token: argv[2] o SUPABASE_ACCESS_TOKEN
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

const token = process.argv[2]?.trim() || process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN requerido como argv[2] o env.');
  process.exit(2);
}

const mcpEntry = path.join(
  __dirname,
  'mcp-runner',
  'node_modules',
  '@supabase',
  'mcp-server-supabase',
  'dist',
  'index.js',
);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [mcpEntry],
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
});

const client = new Client({ name: 'prosavis-deploy-all', version: '1.0.0' }, { capabilities: {} });
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

await client.close().catch(() => {});
fs.writeFileSync(path.join(deployDir, '_deploy-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
