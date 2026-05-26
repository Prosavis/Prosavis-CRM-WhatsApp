import fs from 'fs';
import { packFunction } from './pack-edge-function.mjs';

const WAVE_A = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

const projectId = process.argv[2] ?? 'djzwjaegxbhlefanmmee';
const outDir = process.argv[3] ?? 'scripts/.edge-deploy';

fs.mkdirSync(outDir, { recursive: true });

for (const name of WAVE_A) {
  const payload = {
    project_id: projectId,
    name,
    entrypoint_path: 'index.ts',
    verify_jwt: true,
    files: packFunction(name),
  };
  fs.writeFileSync(`${outDir}/wave-a-${name}.json`, JSON.stringify(payload));
  console.log(`packed ${name} (${payload.files.length} files)`);
}
