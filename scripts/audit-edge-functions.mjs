/**
 * Audita Edge Functions: implementación local vs remoto (stub).
 *
 * Uso:
 *   node scripts/audit-edge-functions.mjs
 *   SUPABASE_ACCESS_TOKEN=... node scripts/audit-edge-functions.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const functionsRoot = path.join(root, 'supabase', 'functions');
const PROJECT_ID = 'djzwjaegxbhlefanmmee';

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

function localFunctions() {
  return fs
    .readdirSync(functionsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '_shared')
    .map((d) => d.name)
    .sort();
}

function isLocalStub(name) {
  const indexPath = path.join(functionsRoot, name, 'index.ts');
  if (!fs.existsSync(indexPath)) return true;
  const content = fs.readFileSync(indexPath, 'utf8');
  return content.includes('serveStub');
}

function isRemoteStub(files) {
  const index = files?.find((f) => f.name === 'index.ts' || f.name?.endsWith('/index.ts'));
  const content = index?.content ?? '';
  if (content.includes('serveStub')) return true;
  if (content.includes('llmClient') || content.includes('whatsappOutbound')) return false;
  return content.length < 500 && /jsonResponse\(\{\s*success:\s*true/.test(content);
}

async function main() {
  const token = loadToken();
  if (!token) {
    console.error('SUPABASE_ACCESS_TOKEN requerido para auditar remoto.');
    process.exit(2);
  }

  const mcpEntry = path.join(
    __dirname,
    'mcp-runner',
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

  const client = new Client({ name: 'audit-edge', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);

  const listRes = await client.callTool({
    name: 'list_edge_functions',
    arguments: { project_id: PROJECT_ID },
  });
  const listText = listRes.content?.find((c) => c.type === 'text')?.text ?? '[]';
  const remoteList = JSON.parse(listText);
  const remoteNames = new Set(remoteList.map((f) => f.slug ?? f.name));

  const locals = localFunctions();
  const report = [];

  for (const name of locals) {
    const localStub = isLocalStub(name);
    let remoteStub = null;
    let remoteVersion = null;
    let remoteMissing = !remoteNames.has(name);

    if (!remoteMissing) {
      try {
        const getRes = await client.callTool({
          name: 'get_edge_function',
          arguments: { project_id: PROJECT_ID, function_slug: name },
        });
        const getText = getRes.content?.find((c) => c.type === 'text')?.text ?? '{}';
        const detail = JSON.parse(getText);
        remoteVersion = detail.version ?? null;
        remoteStub = isRemoteStub(detail.files);
      } catch {
        remoteStub = null;
      }
    }

    let status = 'ok';
    if (localStub) status = 'local_stub';
    else if (remoteMissing) status = 'missing_remote';
    else if (remoteStub) status = 'remote_stub_needs_deploy';
    else if (!localStub && !remoteStub) status = 'deployed_real';

    report.push({
      name,
      status,
      localStub,
      remoteMissing,
      remoteStub,
      remoteVersion,
    });
  }

  await client.close().catch(() => {});

  const needsDeploy = report.filter((r) => r.status === 'remote_stub_needs_deploy' || r.status === 'missing_remote');
  const localStubs = report.filter((r) => r.status === 'local_stub');

  console.log(JSON.stringify({ summary: { needsDeploy: needsDeploy.length, localStubs: localStubs.length }, report }, null, 2));
  process.exit(needsDeploy.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
