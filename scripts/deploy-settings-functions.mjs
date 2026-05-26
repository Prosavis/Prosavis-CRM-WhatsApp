import fs from 'fs';
import { packFunction } from './pack-edge-function.mjs';

const SETTINGS_FUNCTIONS = [
  'list-whatsapp-snippets',
  'create-whatsapp-snippet',
  'update-whatsapp-snippet',
  'delete-whatsapp-snippet',
  'get-whatsapp-business-profile',
  'update-whatsapp-business-profile',
];

const projectId = process.argv[2] ?? 'djzwjaegxbhlefanmmee';
const outDir = process.argv[3] ?? 'scripts/.edge-deploy';

fs.mkdirSync(outDir, { recursive: true });

for (const name of SETTINGS_FUNCTIONS) {
  const payload = {
    project_id: projectId,
    name,
    entrypoint_path: 'index.ts',
    verify_jwt: true,
    files: packFunction(name),
  };
  fs.writeFileSync(`${outDir}/${name}.json`, JSON.stringify(payload));
  console.log(`packed ${name} (${payload.files.length} files)`);
}
