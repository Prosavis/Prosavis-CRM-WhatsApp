import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '..', '.edge-deploy');
const nums = [3, 4, 5, 6];

function loadToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.resolve(__dirname, '..', '..', '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

async function deployOne(client, args) {
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
}

const token = loadToken();
if (!token) {
  console.log(JSON.stringify({ error: 'SUPABASE_ACCESS_TOKEN no definido' }));
  process.exit(2);
}

const mcpEntry = path.join(__dirname, 'node_modules', '@supabase', 'mcp-server-supabase', 'dist', 'index.js');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [mcpEntry],
  env: { ...process.env, SUPABASE_ACCESS_TOKEN: token },
});

const client = new Client({ name: 'deploy-batch-3-6', version: '1.0.0' }, { capabilities: {} });
const results = [];

try {
  await client.connect(transport);
  for (const n of nums) {
    const argsPath = path.join(deployDir, `_callmcp-deploy-${n}-args.json`);
    const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
    process.stderr.write(`Deploying ${args.name} (${args.files.length} files)...\n`);
    try {
      results.push(await deployOne(client, args));
    } catch (err) {
      results.push({ name: args.name, error: String(err.message ?? err) });
    }
  }
} finally {
  await client.close().catch(() => {});
}

console.log(JSON.stringify(results));
