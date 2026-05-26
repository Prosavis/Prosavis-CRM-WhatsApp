import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = process.argv[2];
const out = process.argv[3];
if (!src || !out) {
  console.error('Uso: node build-stub-deploy-args.mjs <args.json> <out.json>');
  process.exit(1);
}

const a = JSON.parse(fs.readFileSync(src, 'utf8'));
const stub = {
  name: '../_shared/whatsappOutbound.ts',
  content:
    'export function formatError(error: unknown): string {\r\n' +
    '  if (error && typeof error === \'object\') {\r\n' +
    '    const record = error as Record<string, unknown>;\r\n' +
    '    const parts = [record.message, record.details, record.hint]\r\n' +
    '      .filter((v) => typeof v === \'string\' && v.length > 0);\r\n' +
    '    if (parts.length) return parts.join(\' — \');\r\n' +
    '  }\r\n' +
    '  return String(error);\r\n' +
    '}\r\n',
};
const files = a.files.filter((f) => !f.name.includes('whatsappOutbound'));
files.push(stub);
const slim = { ...a, files };
fs.writeFileSync(out, JSON.stringify(slim));
console.log(JSON.stringify({ bytes: JSON.stringify(slim).length, files: files.length }));
