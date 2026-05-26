/**
 * Despliega una función leyendo JSON de args (equiv. CallMcpTool deploy_edge_function).
 * Uso: node deploy-one-from-json-stdio.mjs <args-json-path>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.resolve(process.argv[2] ?? '');
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.log(JSON.stringify({ error: `Archivo no encontrado: ${jsonPath}` }));
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
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

const client = new Client({ name: 'deploy-one-from-json', version: '1.0.0' }, { capabilities: {} });

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
    console.log(
      JSON.stringify({
        name: args.name,
        error: parsed.error.message ?? String(parsed.error),
      }),
    );
  } else if (parsed?.version != null) {
    console.log(JSON.stringify({ name: args.name, version: parsed.version }));
  } else {
    console.log(
      JSON.stringify({
        name: args.name,
        error: text.slice(0, 500) || 'deploy sin version',
      }),
    );
  }
} catch (err) {
  console.log(JSON.stringify({ name: args.name, error: String(err.message ?? err) }));
} finally {
  await client.close().catch(() => {});
}
