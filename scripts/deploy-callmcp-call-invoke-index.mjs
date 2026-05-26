/**
 * Emite payload _invoke-{index}.json como JSON en stdout (para CallMcpTool).
 * Uso: node deploy-callmcp-call-invoke-index.mjs <index>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const idx = Number(process.argv[2]);
const invokePath = path.join(__dirname, '.edge-deploy', `_invoke-${idx}.json`);

if (!fs.existsSync(invokePath)) {
  console.error(`No existe ${invokePath}`);
  process.exit(1);
}

process.stdout.write(fs.readFileSync(invokePath, 'utf8'));
