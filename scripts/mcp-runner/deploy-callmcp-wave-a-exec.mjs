/**
 * Despliega wave A leyendo _callmcp-args-{name}.json vía MCP deploy_edge_function.
 * Registra resultados en _deploy-results-wave-a.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');
const runner = path.join(__dirname, 'deploy-callmcp-wave-a-runner.mjs');

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

function record(entry) {
  spawnSync(process.execPath, [runner, 'record', JSON.stringify(entry)], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..', '..'),
  });
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
  env: { ...process.env },
});

const client = new Client({ name: 'deploy-callmcp-wave-a-exec', version: '1.0.0' }, { capabilities: {} });

await client.connect(transport);

for (const name of ORDER) {
  const src = path.join(deployDir, `_callmcp-args-${name}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  process.stderr.write(`Deploying ${name} (${args.files?.length ?? 0} files)...\n`);
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
      record({ name, error: parsed.error.message ?? String(parsed.error) });
    } else if (parsed?.version != null) {
      record({ name, version: parsed.version });
    } else {
      record({ name, error: text.slice(0, 500) || 'deploy sin version' });
    }
  } catch (err) {
    record({ name, error: String(err.message ?? err) });
  }
}

await client.close().catch(() => {});

const summary = spawnSync(process.execPath, [runner, 'summary'], {
  encoding: 'utf8',
  cwd: path.resolve(__dirname, '..', '..'),
});
process.stdout.write(summary.stdout ?? '');
