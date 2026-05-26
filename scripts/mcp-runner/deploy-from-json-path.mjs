/**
 * Despliega un payload _mcp-call-*.json usando el MCP de Supabase (auth del plugin en Cursor).
 * Uso desde el agente: node scripts/mcp-runner/deploy-from-json-path.mjs <ruta-json>
 * Sin SUPABASE_ACCESS_TOKEN: imprime JSON para CallMcpTool.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('Uso: node deploy-from-json-path.mjs <ruta-json>');
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

async function deployViaManagementApi(token) {
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

async function deployViaMcpSdk(token) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
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
  const client = new Client({ name: 'deploy-from-json', version: '1.0.0' }, { capabilities: {} });
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

const token = loadToken();
if (!token) {
  console.log(
    JSON.stringify({
      action: 'CallMcpTool',
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      argumentsPath: path.resolve(jsonPath),
      name: args.name,
      files: args.files.length,
    }),
  );
  process.exit(0);
}

const result = await deployViaManagementApi(token).catch(async (err) => {
  const fallback = await deployViaMcpSdk(token);
  if (fallback.error && String(err.message ?? err).includes('401')) {
    return { name: args.name, error: String(err.message ?? err) };
  }
  return fallback;
});

console.log(JSON.stringify(result));
