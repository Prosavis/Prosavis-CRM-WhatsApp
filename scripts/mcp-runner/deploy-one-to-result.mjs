/**
 * Despliega args JSON vía deploy-callmcp-from-json-file y escribe resultado en archivo.
 * Uso: node deploy-one-to-result.mjs <args-json-path> <result-json-path>
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argsPath = path.resolve(process.argv[2] ?? '');
const outPath = path.resolve(process.argv[3] ?? '');
const helper = path.join(__dirname, 'deploy-callmcp-from-json-file.mjs');

const r = spawnSync(process.execPath, [helper, argsPath], {
  encoding: 'utf8',
  cwd: __dirname,
  maxBuffer: 64 * 1024 * 1024,
});

const stdout = (r.stdout ?? '').trim();
const stderr = (r.stderr ?? '').trim();
let payload;
try {
  payload = JSON.parse(stdout);
} catch {
  payload = { error: 'stdout no es JSON', stdout: stdout.slice(0, 500), stderr: stderr.slice(0, 500) };
}

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
if (payload.action === 'CallMcpTool') {
  process.exit(2);
}
process.exit(payload.version != null ? 0 : 1);
