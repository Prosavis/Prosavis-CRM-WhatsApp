/**
 * Lee _callmcp-args-only.json y escribe solo el objeto `arguments` para invocación MCP.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const argsPath =
  process.argv[2] ??
  path.join(repoRoot, 'scripts', '.edge-deploy-payloads', '_callmcp-args-only.json');
const outPath =
  process.argv[3] ??
  path.join(repoRoot, 'scripts', '.edge-deploy-payloads', '_callmcp-deploy-arguments.json');

const raw = fs.readFileSync(argsPath, 'utf8').replace(/^\uFEFF/, '');
const args = JSON.parse(raw);
if (args.files) {
  args.files = args.files.map((f) => ({
    name: f.name,
    content: String(f.content ?? '').replace(/^\uFEFF/, ''),
  }));
}

fs.writeFileSync(outPath, JSON.stringify(args), 'utf8');
console.log(JSON.stringify({ name: args.name, files: args.files?.length ?? 0, outPath }));
