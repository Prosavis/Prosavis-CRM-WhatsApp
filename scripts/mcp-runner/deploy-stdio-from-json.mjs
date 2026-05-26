import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = process.argv[2];
if (!jsonPath) {
  console.log(JSON.stringify({ error: 'Uso: node deploy-stdio-from-json.mjs <args-json>' }));
  process.exit(1);
}

const args = JSON.parse(fs.readFileSync(path.resolve(jsonPath), 'utf8'));
const mcpEntry = path.join(
  __dirname,
  'node_modules',
  '@supabase',
  'mcp-server-supabase',
  'dist',
  'index.js',
);

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

const token = loadToken();
const env = { ...process.env };
if (token) env.SUPABASE_ACCESS_TOKEN = token;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [mcpEntry],
  env,
});

const client = new Client({ name: 'deploy-stdio-from-json', version: '1.0.0' }, { capabilities: {} });

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
    console.log(
      JSON.stringify({
        name: args.name,
        error: parsed.error.message ?? String(parsed.error),
      }),
    );
  } else if (parsed?.version != null) {
    console.log(JSON.stringify({ name: args.name, version: parsed.version }));
  } else {
    console.log(
      JSON.stringify({
        name: args.name,
        error: text.slice(0, 500) || 'deploy sin version',
      }),
    );
  }
} catch (err) {
  console.log(JSON.stringify({ name: args.name, error: String(err.message ?? err) }));
} finally {
  await client.close().catch(() => {});
}
