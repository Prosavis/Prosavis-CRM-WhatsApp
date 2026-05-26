/**
 * Lee args JSON y escribe wrapper para CallMcpTool (stdout = solo arguments object).
 * Uso: node invoke-callmcp-deploy-from-file.mjs <args-json-path>
 */
import fs from 'fs';
import path from 'path';

const argsPath = path.resolve(process.argv[2] ?? '');
const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
process.stdout.write(JSON.stringify(args));
