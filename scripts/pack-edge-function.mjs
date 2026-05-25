import fs from 'fs';
import path from 'path';

const root = path.resolve('supabase/functions');
const sharedDir = path.join(root, '_shared');

function readShared() {
  return ['cors.ts', 'supabase.ts', 'stub.ts'].map((f) => ({
    name: `../_shared/${f}`,
    content: fs.readFileSync(path.join(sharedDir, f), 'utf8'),
  }));
}

export function packFunction(name) {
  const indexPath = path.join(root, name, 'index.ts');
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  const files = [{ name: 'index.ts', content: indexContent }, ...readShared()];
  const usesStub = indexContent.includes("serveStub");
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
