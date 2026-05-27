import fs from 'fs';
import path from 'path';

const src = process.argv[2];
const dest = process.argv[3];
if (!src || !dest) {
  console.error('Uso: node prepare-callmcp-args.mjs <payload.json> <out.json>');
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(src, 'utf8'));
for (const f of args.files) {
  if (f.name === 'index.ts' || f.name.endsWith('/index.ts')) {
    f.content = f.content.replace(/^\uFEFF/, '');
  }
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(args), 'utf8');
console.log(JSON.stringify({ name: args.name, files: args.files.length, bytes: Buffer.byteLength(JSON.stringify(args)) }));
