/**
 * Lee args JSON y despliega vía Management API (mismo payload que deploy_edge_function).
 * Token: SUPABASE_ACCESS_TOKEN o .env.secrets.local
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSupabaseApiPlatform } from '@supabase/mcp-server-supabase/platform/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

function loadToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }
  const secretsPath = path.join(repoRoot, '.env.secrets.local');
  if (fs.existsSync(secretsPath)) {
    for (const line of fs.readFileSync(secretsPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

function loadArgs(argsPath) {
  const args = JSON.parse(fs.readFileSync(argsPath, 'utf8'));
  args.files = (args.files ?? []).map((f) => ({
    name: f.name,
    content: String(f.content ?? '').replace(/^\uFEFF/, ''),
  }));
  return args;
}

const argsDir = path.resolve(process.argv[2] ?? path.join(repoRoot, '.cursor/_mcp-deploy-args'));
const names = process.argv.slice(3).length
  ? process.argv.slice(3)
  : [
      'get-whatsapp-media-url',
      'on-whatsapp-webhook',
      'send-whatsapp-chat-message',
      'send-whatsapp-media-batch',
    ];

const token = loadToken();
if (!token) {
  console.log(JSON.stringify({ needCallMcpTool: true, names }));
  process.exit(2);
}

const platform = createSupabaseApiPlatform({ accessToken: token });
const results = [];

for (const name of names) {
  const argsPath = path.join(argsDir, `${name}.json`);
  if (!fs.existsSync(argsPath)) {
    results.push({ name, ok: false, error: `No existe ${argsPath}` });
    continue;
  }
  const args = loadArgs(argsPath);
  try {
    const deployed = await platform.functions.deployEdgeFunction(args.project_id, {
      name: args.name,
      entrypoint_path: args.entrypoint_path,
      verify_jwt: args.verify_jwt,
      files: args.files,
    });
    results.push({
      name,
      ok: true,
      version: deployed.version ?? deployed.id ?? null,
      slug: deployed.slug ?? args.name,
    });
  } catch (err) {
    results.push({ name, ok: false, error: String(err.message ?? err) });
  }
}

console.log(JSON.stringify(results, null, 2));
