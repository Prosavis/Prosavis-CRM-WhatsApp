/**
 * Carga args JSON (6 files) y despliega vía createSupabaseApiPlatform si hay token,
 * o escribe resultado needCallMcpTool.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const argsPath = path.resolve(process.argv[2] ?? '');
const outPath = path.resolve(process.argv[3] ?? '');

if (!argsPath || !fs.existsSync(argsPath)) {
  console.error(JSON.stringify({ ok: false, error: `No existe: ${argsPath}` }));
  process.exit(1);
}

const raw = fs.readFileSync(argsPath, 'utf8').replace(/^\uFEFF/, '');
const args = JSON.parse(raw);
args.files = (args.files ?? []).map((f) => ({
  name: f.name,
  content: String(f.content ?? '').replace(/^\uFEFF/, ''),
}));

const token = (process.argv[4] ?? process.env.SUPABASE_ACCESS_TOKEN ?? '').trim();

function writeResult(obj) {
  const line = JSON.stringify(obj);
  if (outPath) fs.writeFileSync(outPath, line, 'utf8');
  console.log(line);
}

if (!token) {
  writeResult({
    name: args.name,
    ok: false,
    needCallMcpTool: true,
    server: 'plugin-supabase-supabase',
    toolName: 'deploy_edge_function',
    files: args.files.length,
    bytes: JSON.stringify(args).length,
  });
  process.exit(2);
}

try {
  const platform = createSupabaseApiPlatform({ accessToken: token });
  const deployed = await platform.functions.deployEdgeFunction(args.project_id, {
    name: args.name,
    entrypoint_path: args.entrypoint_path,
    verify_jwt: args.verify_jwt,
    files: args.files,
  });
  writeResult({
    name: args.name,
    ok: true,
    version: deployed.version ?? deployed.id ?? null,
  });
} catch (err) {
  writeResult({ name: args.name, ok: false, error: String(err.message ?? err) });
  process.exit(1);
}
