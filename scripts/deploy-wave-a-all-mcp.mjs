/**
 * Empaqueta payloads wave-a y escribe manifiesto para despliegue MCP.
 * El agente debe llamar deploy_edge_function por cada entrada en _deploy-queue.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { packFunction } from './pack-edge-function.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');
const projectId = 'djzwjaegxbhlefanmmee';

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

fs.mkdirSync(deployDir, { recursive: true });

const queue = [];
for (const name of ORDER) {
  const payload = {
    project_id: projectId,
    name,
    entrypoint_path: 'index.ts',
    verify_jwt: true,
    files: packFunction(name),
  };
  const argsPath = path.join(deployDir, `_mcp-args-${name}.json`);
  const wavePath = path.join(deployDir, `wave-a-${name}.json`);
  fs.writeFileSync(argsPath, JSON.stringify(payload));
  fs.writeFileSync(wavePath, JSON.stringify(payload));
  queue.push({ name, argsPath, fileCount: payload.files.length, bytes: JSON.stringify(payload).length });
}

fs.writeFileSync(path.join(deployDir, '_deploy-queue.json'), JSON.stringify(queue, null, 2));
console.log(JSON.stringify(queue, null, 2));
