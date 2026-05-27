/**
 * Despliega una Edge Function leyendo el payload JSON completo.
 * Uso con OAuth de Cursor: el agente debe invocar CallMcpTool deploy_edge_function
 * con arguments = JSON.parse(fs.readFileSync(payloadPath)).
 *
 * Con token: node deploy-callmcp-from-json-path.mjs <payload.json> [SUPABASE_ACCESS_TOKEN]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

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

const jsonPath = path.resolve(process.argv[2] ?? '');
if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.error(JSON.stringify({ ok: false, error: `No existe: ${jsonPath}` }));
  process.exit(1);
}

const raw = fs.readFileSync(jsonPath, 'utf8').replace(/^\uFEFF/, '');
const args = JSON.parse(raw);
if (args.files?.[0]) {
  args.files[0].content = String(args.files[0].content).replace(/^\uFEFF/, '');
}

const token = loadToken(process.argv[3]);
if (!token) {
  console.log(
    JSON.stringify({
      ok: false,
      needCallMcpTool: true,
      server: 'plugin-supabase-supabase',
      toolName: 'deploy_edge_function',
      payloadPath: jsonPath,
      name: args.name,
      fileCount: args.files?.length ?? 0,
      bytes: JSON.stringify(args).length,
    }),
  );
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'deploy-callmcp-from-json-path', version: '1.0.0' }, { capabilities: {} });

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
        ok: false,
        error: parsed.error.message ?? String(parsed.error),
      }),
    );
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      name: args.name,
      ok: true,
      version: parsed?.version ?? null,
      slug: parsed?.slug ?? args.name,
    }),
  );
} catch (err) {
  console.log(JSON.stringify({ name: args.name, ok: false, error: String(err.message ?? err) }));
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
