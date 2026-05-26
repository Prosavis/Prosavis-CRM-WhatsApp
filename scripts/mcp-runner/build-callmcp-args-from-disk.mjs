/** Reconstruye args de deploy desde supabase/functions (misma lista que _callmcp-args-*.json). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '..', '.edge-deploy');
const fnRoot = path.resolve(__dirname, '..', '..', 'supabase', 'functions');
const name = process.argv[2]?.trim();

if (!name) {
  console.error('Uso: node build-callmcp-args-from-disk.mjs <function-name>');
  process.exit(1);
}

const metaPath = path.join(deployDir, `_callmcp-args-${name}.json`);
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

const files = meta.files.map((f) => {
  let abs;
  if (f.name === 'index.ts') {
    abs = path.join(fnRoot, name, 'index.ts');
  } else if (f.name.startsWith('../_shared/')) {
    abs = path.join(fnRoot, '_shared', f.name.replace('../_shared/', ''));
  } else {
    throw new Error(`Ruta no soportada: ${f.name}`);
  }
  return { name: f.name, content: fs.readFileSync(abs, 'utf8') };
});

const args = {
  project_id: meta.project_id,
  name: meta.name,
  entrypoint_path: meta.entrypoint_path,
  verify_jwt: meta.verify_jwt,
  files,
};

const out = process.argv[3]?.trim();
if (out) {
  fs.writeFileSync(out, JSON.stringify(args));
  console.log(JSON.stringify({ ok: true, name, files: files.length, out }));
} else {
  process.stdout.write(JSON.stringify(args));
}
