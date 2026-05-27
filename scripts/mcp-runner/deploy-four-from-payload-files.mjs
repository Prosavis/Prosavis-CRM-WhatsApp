/**
 * Imprime instrucciones JSON por función para deploy_edge_function (CallMcpTool).
 * Los arguments completos están en scripts/.edge-deploy-payloads/<slug>.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const payloadDir = path.resolve(__dirname, '../.edge-deploy-payloads');

const ORDER = [
  'get-whatsapp-media-url',
  'on-whatsapp-webhook',
  'send-whatsapp-chat-message',
  'send-whatsapp-media-batch',
];

for (const slug of ORDER) {
  const src = path.join(payloadDir, `${slug}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  if (args.files?.[0]?.content) {
    args.files[0].content = args.files[0].content.replace(/^\uFEFF/, '');
  }
  console.log(JSON.stringify({ slug, payloadBytes: JSON.stringify(args).length, arguments: args }));
}
