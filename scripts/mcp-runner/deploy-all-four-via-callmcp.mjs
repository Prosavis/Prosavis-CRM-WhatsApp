/**
 * Lee cada payload y despliega con deploy_edge_function vía MCP (OAuth en Cursor).
 * Uso en agente: node deploy-all-four-via-callmcp.mjs
 * Imprime una línea JSON por función para que el agente invoque CallMcpTool.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const payloadDir = path.join(__dirname, '..', '.edge-deploy-payloads');
const names = [
  'get-whatsapp-media-url',
  'on-whatsapp-webhook',
  'send-whatsapp-chat-message',
  'send-whatsapp-media-batch',
];

for (const name of names) {
  const p = path.join(payloadDir, `${name}.json`);
  const args = JSON.parse(fs.readFileSync(p, 'utf8'));
  console.log(
    JSON.stringify({
      step: 'CallMcpTool',
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      name: args.name,
      bytes: JSON.stringify(args).length,
      fileCount: args.files.length,
      arguments: args,
    }),
  );
}
