import fs from 'fs';
import path from 'path';

const root = path.resolve('supabase/functions');
const sharedDir = path.join(root, '_shared');

function readSharedFor(indexContent) {
  const needed = new Set(['cors.ts', 'supabase.ts']);
  for (const match of indexContent.matchAll(/from '\.\.\/_shared\/([^']+)'/g)) {
    needed.add(match[1]);
  }

  const scanned = new Set();
  while (true) {
    const pending = [...needed].filter((f) => !scanned.has(f));
    if (!pending.length) break;
    for (const file of pending) {
      scanned.add(file);
      const content = fs.readFileSync(path.join(sharedDir, file), 'utf8');
      for (const match of content.matchAll(/from '\.\/([^']+)'/g)) {
        needed.add(match[1]);
      }
    }
  }

  return [...needed].sort().map((f) => ({
    name: `../_shared/${f}`,
    content: fs.readFileSync(path.join(sharedDir, f), 'utf8'),
  }));
}

export function packFunction(name) {
  const indexPath = path.join(root, name, 'index.ts');
  const indexContent = fs.readFileSync(indexPath, 'utf8').replace(/^\uFEFF/, '');
  const usesStub = indexContent.includes('serveStub');
  const files = [{ name: 'index.ts', content: indexContent }, ...readSharedFor(indexContent)];
  if (!usesStub) {
    return files.filter((f) => !f.name.endsWith('stub.ts'));
  }
  return files;
}

const skip = new Set([
  'get-whatsapp-metrics',
  'list-whatsapp-message-log',
  'send-whatsapp-chat-message',
  'get-whatsapp-automation-setting',
  'set-whatsapp-automation-setting',
  'get-whatsapp-media-signed-url',
  'on-whatsapp-webhook',
  'patch-whatsapp-conversation',
  'mark-whatsapp-as-read',
  'purge-whatsapp-message-log',
  'ensure-whatsapp-conversation-from-lead',
  'list-whatsapp-ia-templates',
  'get-whatsapp-media-url',
]);

const names = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== '_shared')
  .map((d) => d.name)
  .filter((n) => !skip.has(n))
  .sort();

const out = names.map((name) => ({
  name,
  entrypoint_path: 'index.ts',
  verify_jwt: name !== 'on-whatsapp-webhook',
  files: packFunction(name),
}));

process.stdout.write(JSON.stringify(out));
