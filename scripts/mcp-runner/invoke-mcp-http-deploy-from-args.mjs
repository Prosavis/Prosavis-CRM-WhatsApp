/**
 * Invoca deploy_edge_function vía MCP HTTP con token explícito o env.
 * Uso: node invoke-mcp-http-deploy-from-args.mjs <args.json> [sbp_token]
 */
import fs from 'fs';
import path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const argsPath = path.resolve(process.argv[2] ?? '');
const token = (process.argv[3] ?? process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();

if (!argsPath || !fs.existsSync(argsPath)) {
  console.log(JSON.stringify({ ok: false, error: `No existe: ${argsPath}` }));
  process.exit(1);
}

const raw = fs.readFileSync(argsPath, 'utf8').replace(/^\uFEFF/, '');
const args = JSON.parse(raw);
args.files = (args.files ?? []).map((f) => ({
  name: f.name,
  content: String(f.content ?? '').replace(/^\uFEFF/, ''),
}));

if (!token) {
  console.log(
    JSON.stringify({
      name: args.name,
      ok: false,
      error: 'SUPABASE_ACCESS_TOKEN required for HTTP MCP deploy',
      files: args.files.length,
    }),
  );
  process.exit(2);
}

const transport = new StreamableHTTPClientTransport(new URL('https://mcp.supabase.com/mcp'), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: 'invoke-mcp-http-deploy', version: '1.0.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  const response = await client.callTool({ name: 'deploy_edge_function', arguments: args });
  const text = response.content?.find((c) => c.type === 'text')?.text ?? '';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  const version = parsed?.version ?? parsed?.data?.version ?? null;
  console.log(
    JSON.stringify({
      name: args.name,
      ok: !response.isError,
      version: version ?? undefined,
      error: response.isError ? text.slice(0, 500) : undefined,
    }),
  );
  process.exit(response.isError ? 1 : 0);
} catch (err) {
  console.log(JSON.stringify({ name: args.name, ok: false, error: String(err.message ?? err) }));
  process.exit(1);
} finally {
  await client.close().catch(() => {});
}
