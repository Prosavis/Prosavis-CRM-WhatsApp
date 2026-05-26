/**
 * Prueba deploy vía MCP HTTP (mismo endpoint que plugin-supabase-supabase).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');
const name = process.argv[2] ?? 'suggest-whatsapp-agent-reply';
const src = path.join(deployDir, `_cursor-deploy-${name}.json`);
const args = JSON.parse(fs.readFileSync(src, 'utf8'));

const transport = new StreamableHTTPClientTransport(
  new URL('https://mcp.supabase.com/mcp'),
);
const client = new Client({ name: 'deploy-http-test', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  const response = await client.callTool({
    name: 'deploy_edge_function',
    arguments: args,
  });
  const text = response.content?.find((c) => c.type === 'text')?.text ?? '';
  console.log(text);
} catch (err) {
  console.log(JSON.stringify({ error: String(err.message ?? err) }));
} finally {
  await client.close().catch(() => {});
}
