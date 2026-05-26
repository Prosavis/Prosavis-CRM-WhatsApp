import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const name = process.argv[2];
if (!name) {
  console.error('Uso: node print-cursor-args.mjs <function-name>');
  process.exit(1);
}

const deployDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.edge-deploy');
const src = path.join(deployDir, `_cursor-deploy-${name}.json`);
const out = path.join(deployDir, '_active-callmcp.json');
fs.writeFileSync(out, fs.readFileSync(src, 'utf8'));
console.log(JSON.stringify({ name, src, out, bytes: fs.statSync(out).size }));
