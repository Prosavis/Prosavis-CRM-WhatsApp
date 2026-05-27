/**
 * Empaqueta y despliega Edge Functions por oleadas (MCP Supabase).
 *
 * Uso:
 *   node scripts/deploy-all-edge-functions.mjs --wave a
 *   node scripts/deploy-all-edge-functions.mjs --wave b
 *   node scripts/deploy-all-edge-functions.mjs --wave c
 *   node scripts/deploy-all-edge-functions.mjs --wave all
 *   node scripts/deploy-all-edge-functions.mjs --wave a --pack-only
 *
 * Requiere SUPABASE_ACCESS_TOKEN (env o .env.secrets.local).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { packFunction } from './pack-edge-function.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const deployDir = path.join(__dirname, '.edge-deploy');
const PROJECT_ID = 'djzwjaegxbhlefanmmee';

const WAVES = {
  a: [
    'suggest-whatsapp-agent-reply',
    'transcribe-whatsapp-inbound-audio',
    'get-whatsapp-booking-context',
  ],
  b: [
    'bulk-whatsapp-send',
    'send-whatsapp-template-message',
    'send-whatsapp-reaction',
    'send-whatsapp-media-batch',
    'block-whatsapp-user-admin',
    'list-whatsapp-message-templates',
    'send-whatsapp-chat-message',
    'mark-whatsapp-as-read',
    'list-whatsapp-snippets',
    'create-whatsapp-snippet',
    'update-whatsapp-snippet',
    'delete-whatsapp-snippet',
  ],
  c: [
    'list-whatsapp-stickers',
    'create-whatsapp-sticker',
    'update-whatsapp-sticker',
    'get-prosavis-cleaning-wompi-checkout-url',
    'delete-whatsapp-conversation-admin',
    'delete-whatsapp-message-log-entry',
    'get-whatsapp-business-profile',
    'update-whatsapp-business-profile',
    'patch-whatsapp-conversation',
    'on-whatsapp-webhook',
    'get-whatsapp-media-url',
    'get-whatsapp-media-signed-url',
    'ensure-whatsapp-conversation-from-lead',
    'purge-whatsapp-message-log',
    'get-whatsapp-metrics',
    'list-whatsapp-message-log',
  ],
};

function loadToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.join(root, '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

function parseArgs(argv) {
  let wave = 'a';
  let packOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--wave' && argv[i + 1]) wave = argv[++i].toLowerCase();
    if (argv[i] === '--pack-only') packOnly = true;
  }
  return { wave, packOnly };
}

function buildPayload(name) {
  return {
    project_id: PROJECT_ID,
    name,
    entrypoint_path: 'index.ts',
    verify_jwt: name !== 'on-whatsapp-webhook',
    files: packFunction(name),
  };
}

function packWave(functions) {
  fs.mkdirSync(deployDir, { recursive: true });
  for (const name of functions) {
    const payload = buildPayload(name);
    const out = path.join(deployDir, `wave-${name}.json`);
    fs.writeFileSync(out, JSON.stringify(payload));
    const mcpOut = path.join(deployDir, `_mcp-call-${name}.json`);
    fs.writeFileSync(mcpOut, JSON.stringify(payload));
    console.log(`packed ${name} (${payload.files.length} files)`);
  }
}

async function deployWave(functions, token) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

  const mcpEntry = path.join(
    __dirname,
    'mcp-runner',
    'node_modules',
    '@supabase',
    'mcp-server-supabase',
    'dist',
    'index.js',
  );
  if (!fs.existsSync(mcpEntry)) {
    throw new Error('Ejecuta: npm install en scripts/mcp-runner');
  }

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpEntry],
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  });

  const client = new Client({ name: 'deploy-all-edge', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  const results = [];
  for (const name of functions) {
    const src = path.join(deployDir, `_mcp-call-${name}.json`);
    if (!fs.existsSync(src)) {
      results.push({ name, error: 'payload no empaquetado; corre sin --pack-only primero' });
      continue;
    }
    const args = JSON.parse(fs.readFileSync(src, 'utf8'));
    process.stderr.write(`Deploying ${name}...\n`);
    try {
      const response = await client.callTool({
        name: 'deploy_edge_function',
        arguments: args,
      });
      const text = response.content?.find((c) => c.type === 'text')?.text ?? '';
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
      if (parsed?.error) {
        results.push({ name, error: parsed.error.message ?? String(parsed.error) });
      } else if (parsed?.version != null) {
        results.push({ name, version: parsed.version });
      } else {
        results.push({ name, error: text.slice(0, 500) || 'deploy sin version' });
      }
    } catch (err) {
      results.push({ name, error: String(err.message ?? err) });
    }
  }

  await client.close().catch(() => {});
  return results;
}

const { wave, packOnly } = parseArgs(process.argv.slice(2));
const waveKeys =
  wave === 'all' ? ['a', 'b', 'c'] : wave === 'ab' || wave === 'bc' ? wave.split('') : [wave];

const functions = [];
for (const key of waveKeys) {
  const list = WAVES[key];
  if (!list) {
    console.error(`Oleada desconocida: ${key}. Usa a, b, c o all.`);
    process.exit(1);
  }
  functions.push(...list);
}

console.log(`Oleada(s): ${waveKeys.join(', ')} — ${functions.length} funciones`);
packWave(functions);

if (packOnly) {
  console.log('Solo empaquetado (--pack-only).');
  process.exit(0);
}

const token = loadToken();
if (!token) {
  console.error(
    'SUPABASE_ACCESS_TOKEN no definido. Agrégalo a .env.secrets.local o usa: npx supabase functions deploy ...',
  );
  process.exit(2);
}

const results = await deployWave(functions, token);
const outPath = path.join(deployDir, `_deploy-results-${wave}.json`);
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

const failed = results.filter((r) => r.error);
process.exit(failed.length ? 1 : 0);
