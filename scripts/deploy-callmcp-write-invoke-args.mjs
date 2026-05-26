/** Escribe _invoke-{idx}.json como _mcp-args-{idx}-for-call.json para CallMcpTool. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const idx = process.argv[2];
if (!idx) {
  console.error('Uso: node deploy-callmcp-write-invoke-args.mjs <index>');
  process.exit(1);
}

const deployDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.edge-deploy');
const src = path.join(deployDir, `_invoke-${idx}.json`);
const dst = path.join(deployDir, `_mcp-args-${idx}-for-call.json`);
const args = JSON.parse(fs.readFileSync(src, 'utf8'));
fs.writeFileSync(dst, JSON.stringify(args));
console.log(JSON.stringify({ name: args.name, fileCount: args.files.length, dst }));
