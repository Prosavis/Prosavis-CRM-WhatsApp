/**
 * Despliega las 7 funciones leyendo _mcp-call-{name}.json vía MCP SDK.
 * Equivalente a CallMcpTool deploy_edge_function con payloads completos.
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

const client = new Client({ name: 'prosavis-deploy-all-7', version: '1.0.0' }, { capabilities: {} });
const results = [];

try {
  await client.connect(transport);

  for (const name of ORDER) {
    const src = path.join(deployDir, `_mcp-call-${name}.json`);
    const args = JSON.parse(fs.readFileSync(src, 'utf8'));
    process.stderr.write(`Deploying ${name} (${args.files.length} files)...\n`);

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
        const error = parsed.error.message ?? String(parsed.error);
        results.push({ name, error });
        process.stderr.write(`FAIL ${name}: ${error}\n`);
      } else if (parsed?.version != null) {
        results.push({ name, version: parsed.version });
        process.stderr.write(`OK ${name} v${parsed.version}\n`);
      } else {
        const error = text.slice(0, 500) || 'deploy sin version';
        results.push({ name, error });
        process.stderr.write(`FAIL ${name}: ${error}\n`);
      }
    } catch (err) {
      const error = String(err.message ?? err);
      results.push({ name, error });
      process.stderr.write(`FAIL ${name}: ${error}\n`);
    }
  }
} finally {
  await client.close().catch(() => {});
}

const outPath = path.join(deployDir, '_deploy-results.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
