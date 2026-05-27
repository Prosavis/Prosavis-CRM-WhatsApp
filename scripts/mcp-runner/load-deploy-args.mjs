import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const candidates = [
  process.argv[2],
  path.join(repoRoot, 'scripts', '.edge-deploy-payloads', '_callmcp-args-only.json'),
  path.join(repoRoot, '.cursor', '_mcp-deploy-args', 'send-whatsapp-media-batch.json'),
  path.join(repoRoot, 'scripts', '.edge-deploy-payloads', 'send-whatsapp-media-batch.json'),
].filter(Boolean);

let argsPath = candidates.find((p) => fs.existsSync(p));
if (!argsPath) {
  console.error(JSON.stringify({ error: 'No deploy args file found' }));
  process.exit(1);
}

const raw = fs.readFileSync(argsPath, 'utf8').replace(/^\uFEFF/, '');
const args = JSON.parse(raw);
args.files = (args.files ?? []).map((f) => ({
  name: f.name,
  content: String(f.content ?? '').replace(/^\uFEFF/, ''),
}));

process.stdout.write(JSON.stringify(args));
