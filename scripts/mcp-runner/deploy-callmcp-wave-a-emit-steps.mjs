/**
 * Despliega las 7 funciones wave A vía CallMcpTool (agente).
 * Emite un JSON por función con { step, name, arguments } para invocar deploy_edge_function.
 * Uso: node deploy-callmcp-wave-a-emit-steps.mjs [function-name]
 * Sin nombre: emite las 7 en orden.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

const only = process.argv[2]?.trim();
const names = only ? [only] : ORDER;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');

for (let i = 0; i < names.length; i++) {
  const name = names[i];
  const src = path.join(deployDir, `_callmcp-args-${name}.json`);
  const arguments_ = JSON.parse(fs.readFileSync(src, 'utf8'));
  const outPath = path.join(deployDir, `_callmcp-step-${i + 1}-${name}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify({
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      name,
      step: i + 1,
      arguments: arguments_,
    }),
  );
  console.log(JSON.stringify({ step: i + 1, name, outPath, bytes: JSON.stringify(arguments_).length }));
}
