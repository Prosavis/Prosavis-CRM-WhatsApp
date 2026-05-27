/**
 * Despliega 4 funciones leyendo agent-tools/deploy-args-*.json vía Management API.
 * Token: argv[2] o SUPABASE_ACCESS_TOKEN.
 * Equivalente a deploy_edge_function (MCP).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const agentTools = path.resolve(
  __dirname,
  '../../../.cursor/projects/c-Users-Prosavis-Documents-GitHub-Prosavis-App/agent-tools',
);

const SLUGS = [
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
  return null;
}

const token = loadToken(process.argv[2]);
const results = [];

if (!token) {
  for (const slug of SLUGS) {
    results.push({
      slug,
      ok: false,
      needCallMcpTool: true,
      argsPath: path.join(agentTools, `deploy-args-${slug}.json`),
    });
  }
  console.log(JSON.stringify({ needCallMcpTool: true, results }, null, 2));
  process.exit(2);
}

const platform = createSupabaseApiPlatform({ accessToken: token });

for (const slug of SLUGS) {
  const argsPath = path.join(agentTools, `deploy-args-${slug}.json`);
  if (!fs.existsSync(argsPath)) {
    results.push({ slug, ok: false, error: `Missing ${argsPath}` });
    continue;
  }
  const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
  try {
    const deployed = await platform.functions.deployEdgeFunction(args.project_id, {
      name: args.name,
      entrypoint_path: args.entrypoint_path,
      verify_jwt: args.verify_jwt,
      files: args.files,
    });
    results.push({
      slug,
      ok: true,
      version: deployed.version ?? null,
      name: args.name,
    });
    process.stderr.write(`OK ${slug} v${deployed.version}\n`);
  } catch (err) {
    results.push({ slug, ok: false, error: String(err.message ?? err) });
    process.stderr.write(`FAIL ${slug}: ${err.message ?? err}\n`);
  }
}

console.log(JSON.stringify(results, null, 2));
process.exit(results.some((r) => !r.ok) ? 1 : 0);
