/** Emite argumentos deploy desde _cursor-deploy-{name}.json (UTF-8). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const name = process.argv[2];
if (!name) {
  console.error('Uso: node deploy-callmcp-wave-a-one.mjs <function-name>');
  process.exit(1);
}

const deployDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.edge-deploy');
const src = path.join(deployDir, `_cursor-deploy-${name}.json`);
process.stdout.write(fs.readFileSync(src, 'utf8'));
