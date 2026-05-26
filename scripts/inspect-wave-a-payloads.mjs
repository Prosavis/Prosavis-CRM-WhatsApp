import fs from 'fs';
import path from 'path';

const waveA = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

const outDir = 'scripts/.edge-deploy';

for (const name of waveA) {
  const payload = JSON.parse(
    fs.readFileSync(path.join(outDir, `wave-a-${name}.json`), 'utf8'),
  );
  console.log(`\n=== ${name} (${payload.files.length} files) ===`);
  console.log(JSON.stringify({
    project_id: payload.project_id,
    name: payload.name,
    entrypoint_path: payload.entrypoint_path,
    verify_jwt: payload.verify_jwt,
    file_names: payload.files.map((f) => f.name),
  }));
}
