/** Emite args completos de deploy desde _callmcp-args-{name}.json (stdout). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const name = process.argv[2]?.trim();
if (!name) {
  console.error('Uso: node deploy-callmcp-read-args.mjs <function-name>');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, '..', '.edge-deploy', `_callmcp-args-${name}.json`);
if (!fs.existsSync(src)) {
  console.error(`No existe: ${src}`);
  process.exit(1);
}

process.stdout.write(fs.readFileSync(src, 'utf8'));
