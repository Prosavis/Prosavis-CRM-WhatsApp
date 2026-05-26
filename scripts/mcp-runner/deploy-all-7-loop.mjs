/**
 * Despliega las 7 funciones en orden vía Management API o indica CallMcpTool.
 * Uso: node deploy-all-7-loop.mjs [token]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.resolve(__dirname, '../.edge-deploy');
const resultsPath = path.join(deployDir, '_deploy-results.json');

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

function loadToken(explicit) {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const secretsPath = path.resolve(__dirname, '../../.env.secrets.local');
  if (fs.existsSync(secretsPath)) {
    for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

const token = loadToken(process.argv[2]);
const results = [];

if (!token) {
  for (const name of ORDER) {
    const argsPath = path.join(deployDir, `_pending-callmcp-${name}.json`);
    if (!fs.existsSync(argsPath)) {
      results.push({ name, error: `Missing ${argsPath}` });
      continue;
    }
    const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
    results.push({
      name,
      error: `CallMcpTool deploy_edge_function (${args.files.length} files, ${JSON.stringify(args).length} bytes)`,
    });
  }
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ needCallMcpTool: true, order: ORDER, resultsPath }));
  process.exit(2);
}

for (const name of ORDER) {
  const argsPath = path.join(deployDir, `_pending-callmcp-${name}.json`);
  const proc = spawnSync(
    process.execPath,
    [path.join(__dirname, 'deploy-mgmt-api-from-json.mjs'), argsPath, token],
    { encoding: 'utf8' },
  );
  const line = (proc.stdout || '').trim().split('\n').pop();
  try {
    const entry = JSON.parse(line);
    results.push(entry);
    process.stderr.write(`${entry.version != null ? 'OK' : 'FAIL'} ${name} ${entry.version ?? entry.error}\n`);
  } catch {
    results.push({ name, error: (proc.stderr || proc.stdout || 'deploy failed').slice(0, 500) });
  }
}

fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
