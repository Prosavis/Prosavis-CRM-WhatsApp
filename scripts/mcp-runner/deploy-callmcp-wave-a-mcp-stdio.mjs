/**
 * Despliega las 7 funciones wave A vía Supabase MCP (stdio) con token.
 * Uso: node deploy-callmcp-wave-a-mcp-stdio.mjs [SUPABASE_ACCESS_TOKEN]
 * Sin token: imprime instrucción y sale 2.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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

const token = process.argv[2]?.trim() || process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN requerido');
  process.exit(2);
}

const mcpEntry = path.join(
  __dirname,
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

const client = new Client({ name: 'deploy-wave-a-mcp-stdio', version: '1.0.0' }, { capabilities: {} });
const results = [];

try {
  await client.connect(transport);
  for (const name of ORDER) {
    const src = path.join(deployDir, `_callmcp-args-${name}.json`);
    const args = JSON.parse(fs.readFileSync(src, 'utf8'));
    process.stderr.write(`Deploying ${name}...\n`);
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
      } else if (response.isError) {
        results.push({ name, error: text.slice(0, 500) || 'MCP error' });
      } else {
        results.push({ name, version: parsed?.version ?? text.slice(0, 200) || null });
      }
    } catch (err) {
      results.push({ name, error: String(err.message ?? err) });
    }
  }
} finally {
  await client.close().catch(() => {});
}

const outPath = path.join(deployDir, '_deploy-results-wave-a.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
