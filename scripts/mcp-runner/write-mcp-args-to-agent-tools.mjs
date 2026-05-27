import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const payloadDir = path.join(repoRoot, 'scripts', '.edge-deploy-payloads');
const outDir =
  process.argv[2] ??
  path.join(
    process.env.USERPROFILE ?? '',
    '.cursor',
    'projects',
    'c-Users-Prosavis-Documents-GitHub-Prosavis-App',
    'agent-tools',
  );

const slugs = [
  'get-whatsapp-media-url',
  'on-whatsapp-webhook',
  'send-whatsapp-chat-message',
  'send-whatsapp-media-batch',
];

fs.mkdirSync(outDir, { recursive: true });

for (const slug of slugs) {
  const payloadPath = path.join(payloadDir, `${slug}.json`);
  const json = execFileSync(
    process.execPath,
    [path.join(__dirname, 'deploy-one-for-callmcp.mjs'), payloadPath],
    { encoding: 'utf8', cwd: repoRoot },
  );
  const outPath = path.join(outDir, `mcp-args-${slug}.json`);
  fs.writeFileSync(outPath, json, 'utf8');
  const args = JSON.parse(json);
  const shared = args.files?.find((f) => f.name.includes('whatsappMediaStorage'));
  console.log(slug, '->', outPath, 'files', args.files?.length, 'shared', shared?.content?.length ?? 0);
}
