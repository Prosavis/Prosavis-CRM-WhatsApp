/**
 * Lee cada payload JSON y despliega vía deploy_edge_function (MCP HTTP o mgmt API).
 * Token: argv[2] o SUPABASE_ACCESS_TOKEN o .env.secrets.local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const payloadDir = path.join(repoRoot, 'scripts', '.edge-deploy-payloads');
const resultsPath = path.join(repoRoot, '.cursor', 'deploy-four-results.json');

const NAMES = [
  'get-whatsapp-media-url',
  'on-whatsapp-webhook',
  'send-whatsapp-chat-message',
  'send-whatsapp-media-batch',
];

function loadToken(explicit) {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.join(repoRoot, '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

async function deployViaMgmtApi(args, token) {
  const form = new FormData();
  form.append(
    'metadata',
    new Blob(
      [
        JSON.stringify({
          name: args.name,
          entrypoint_path: args.entrypoint_path,
          verify_jwt: args.verify_jwt,
        }),
      ],
      { type: 'application/json' },
    ),
  );
  for (const file of args.files) {
    form.append('file', new Blob([file.content], { type: 'application/typescript' }), file.name);
  }
  const url = `https://api.supabase.com/v1/projects/${args.project_id}/functions/deploy?slug=${encodeURIComponent(args.name)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    throw new Error(parsed?.message ?? parsed?.error ?? text.slice(0, 500) ?? `HTTP ${res.status}`);
  }
  return { version: parsed?.version ?? parsed?.id ?? null, slug: parsed?.slug ?? args.name };
}

async function deployViaMcp(args, token) {
  const transport = new StreamableHTTPClientTransport(
    new URL('https://mcp.supabase.com/mcp'),
    { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const client = new Client({ name: 'deploy-four-batch', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
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
      throw new Error(parsed.error.message ?? String(parsed.error));
    }
    return { version: parsed?.version ?? null, slug: parsed?.slug ?? args.name };
  } finally {
    await client.close().catch(() => {});
  }
}

const token = loadToken(process.argv[2]);
const results = [];

if (!token) {
  for (const name of NAMES) {
    const payloadPath = path.join(payloadDir, `${name}.json`);
    results.push({
      name,
      ok: false,
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      payloadPath,
    });
  }
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ needCallMcpTool: true, resultsPath, results }, null, 2));
  process.exit(2);
}

for (const name of NAMES) {
  const payloadPath = path.join(payloadDir, `${name}.json`);
  if (!fs.existsSync(payloadPath)) {
    results.push({ name, ok: false, error: `Missing ${payloadPath}` });
    continue;
  }
  const args = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  try {
    let out;
    try {
      out = await deployViaMcp(args, token);
    } catch (mcpErr) {
      out = await deployViaMgmtApi(args, token);
    }
    results.push({ name, ok: true, version: out.version, slug: out.slug });
    process.stderr.write(`OK ${name} v${out.version}\n`);
  } catch (err) {
    results.push({ name, ok: false, error: String(err.message ?? err) });
    process.stderr.write(`FAIL ${name}: ${err.message ?? err}\n`);
  }
}

fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
