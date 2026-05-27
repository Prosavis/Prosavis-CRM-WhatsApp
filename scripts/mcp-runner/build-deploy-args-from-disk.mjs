/**
 * Construye args desde fuentes en disco (6 archivos) y escribe JSON para CallMcpTool.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const fnDir = path.join(repoRoot, 'supabase', 'functions');
const sharedDir = path.join(fnDir, '_shared');

function readRel(relPath) {
  const full = path.join(fnDir, relPath.replace(/^\.\.\//, ''));
  return fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '');
}

const args = {
  project_id: 'djzwjaegxbhlefanmmee',
  name: 'send-whatsapp-media-batch',
  entrypoint_path: 'index.ts',
  verify_jwt: true,
  files: [
    { name: 'index.ts', content: readRel('send-whatsapp-media-batch/index.ts') },
    { name: '../_shared/cors.ts', content: readRel('_shared/cors.ts') },
    { name: '../_shared/supabase.ts', content: readRel('_shared/supabase.ts') },
    {
      name: '../_shared/whatsappMediaStorage.ts',
      content: readRel('_shared/whatsappMediaStorage.ts'),
    },
    { name: '../_shared/whatsappOutbound.ts', content: readRel('_shared/whatsappOutbound.ts') },
    { name: '../_shared/whatsappIdentity.ts', content: readRel('_shared/whatsappIdentity.ts') },
  ],
};

const outPath =
  process.argv[2] ??
  path.join(repoRoot, 'scripts', '.edge-deploy-payloads', '_callmcp-deploy-arguments.json');
fs.writeFileSync(outPath, JSON.stringify(args), 'utf8');
console.log(JSON.stringify({ name: args.name, files: args.files.length, bytes: JSON.stringify(args).length, outPath }));
