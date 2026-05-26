/**
 * Despliega _invoke-{index}.json indices 2-6 vía MCP SDK deploy_edge_function.
 * Equivalente a CallMcpTool con payloads completos. Token: argv[2] o env.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deployDir = path.join(__dirname, '.edge-deploy');
const INDICES = [2, 3, 4, 5, 6];
function loadToken() {
  if (process.argv[2]?.trim()) return process.argv[2].trim();
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.resolve(__dirname, '..', '.env.secrets.local');
  if (!fs.existsSync(secretsPath)) return null;
  for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const token = loadToken();

const results = [
  { name: 'suggest-whatsapp-agent-reply', version: 6 },
  { name: 'generate-whatsapp-ia-template', version: 6 },
];

if (!token) {
  console.log(JSON.stringify({ error: 'SUPABASE_ACCESS_TOKEN no está definido.', results }));
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

const client = new Client({ name: 'invoke-deploy-wave', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);

  for (const idx of INDICES) {
    const args = JSON.parse(fs.readFileSync(path.join(deployDir, `_invoke-${idx}.json`), 'utf8'));
    process.stderr.write(`Deploying ${args.name} (${args.files.length} files)...\n`);

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
        results.push({ name: args.name, error: parsed.error.message ?? String(parsed.error) });
      } else if (parsed?.version != null) {
        results.push({ name: args.name, version: parsed.version });
      } else {
        results.push({ name: args.name, error: text.slice(0, 500) || 'deploy sin version' });
      }
    } catch (err) {
      results.push({ name: args.name, error: String(err.message ?? err) });
    }
  }
} finally {
  await client.close().catch(() => {});
}

fs.writeFileSync(path.join(deployDir, '_deploy-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
