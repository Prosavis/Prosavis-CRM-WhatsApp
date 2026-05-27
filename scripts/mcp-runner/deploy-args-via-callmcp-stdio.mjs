/**
 * Despliega leyendo args JSON (deploy_edge_function) vía MCP stdio local de Cursor.
 * Uso: node deploy-args-via-callmcp-stdio.mjs <args.json>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argsPath = path.resolve(process.argv[2] ?? '');
if (!argsPath || !fs.existsSync(argsPath)) {
  console.error(JSON.stringify({ ok: false, error: `No existe: ${argsPath}` }));
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
const mcpServerPath = path.join(
  __dirname,
  'node_modules',
  '@supabase',
  'mcp-server-supabase',
  'dist',
  'index.js',
);

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [mcpServerPath],
  env: { ...process.env },
});

const client = new Client({ name: 'deploy-args-stdio', version: '1.0.0' }, { capabilities: {} });

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
    parsed = { raw: text };
  }
  if (parsed?.error) {
    console.log(
      JSON.stringify({
        name: args.name,
        ok: false,
        error: parsed.error.message ?? String(parsed.error),
      }),
    );
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      name: args.name,
      ok: true,
      version: parsed.version ?? null,
      slug: parsed.slug ?? args.name,
    }),
  );
} catch (err) {
  console.log(JSON.stringify({ name: args.name, ok: false, error: String(err.message ?? err) }));
  process.exit(1);
} finally {
  await client.close();
}
