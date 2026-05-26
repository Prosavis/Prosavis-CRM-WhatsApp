import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '..', '.edge-deploy');

const ORDER = [
  'suggest-whatsapp-agent-reply',
  'generate-whatsapp-ia-template',
  'transcribe-whatsapp-inbound-audio',
  'get-whatsapp-booking-context',
  'create-whatsapp-ia-template',
  'delete-whatsapp-ia-template',
  'resolve-whatsapp-ia-template',
];

function loadToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.resolve(__dirname, '../../.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

async function deployViaManagementApi(args, token) {
  const { project_id, name, entrypoint_path, verify_jwt, files } = args;
  const form = new FormData();
  form.append('metadata', JSON.stringify({ entrypoint_path, name, verify_jwt }));
  for (const file of files) {
    form.append('file', new Blob([file.content], { type: 'text/plain' }), file.name);
  }
  const url = `https://api.supabase.com/v1/projects/${project_id}/functions/deploy?slug=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = {};
  }
  if (!res.ok) {
    return { name, error: body?.message ?? text.slice(0, 500) };
  }
  return { name, version: body?.version ?? body?.data?.version ?? null };
}

async function deployViaMcpSdk(args, token) {
  const mcpEntry = path.join(
    __dirname,
    'node_modules',
    '@supabase',
    'mcp-server-supabase',
    'dist',
    'index.js',
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [mcpEntry],
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
  });
  const client = new Client({ name: 'deploy-all-7-inline', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
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
      return { name: args.name, error: parsed.error.message ?? String(parsed.error) };
    }
    if (parsed?.version != null) {
      return { name: args.name, version: parsed.version };
    }
    return { name: args.name, error: text.slice(0, 500) || 'deploy sin version' };
  } finally {
    await client.close().catch(() => {});
  }
}

const token = loadToken();
const results = [];

for (const fn of ORDER) {
  const src = path.join(deployDir, `_mcp-call-${fn}.json`);
  const args = JSON.parse(fs.readFileSync(src, 'utf8'));
  process.stderr.write(`Deploying ${fn} (${args.files.length} files)...\n`);
  try {
    let result;
    if (token) {
      result = await deployViaManagementApi(args, token);
    } else {
      result = { name: fn, error: 'SUPABASE_ACCESS_TOKEN no disponible para MCP SDK' };
    }
    results.push(result);
    process.stderr.write(`${result.version != null ? 'OK' : 'FAIL'} ${fn}: ${result.version ?? result.error}\n`);
  } catch (err) {
    const error = String(err.message ?? err);
    results.push({ name: fn, error });
    process.stderr.write(`FAIL ${fn}: ${error}\n`);
  }
}

const outPath = path.join(deployDir, '_deploy-results.json');
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
