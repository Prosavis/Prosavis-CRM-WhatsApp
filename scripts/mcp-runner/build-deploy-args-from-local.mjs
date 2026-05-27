import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const fnRoot = path.join(repoRoot, 'supabase', 'functions');

const stripBom = (s) => String(s).replace(/^\uFEFF/, '');

const files = [
  { name: 'index.ts', local: path.join(fnRoot, 'send-whatsapp-chat-message', 'index.ts') },
  { name: '../_shared/cors.ts', local: path.join(fnRoot, '_shared', 'cors.ts') },
  { name: '../_shared/supabase.ts', local: path.join(fnRoot, '_shared', 'supabase.ts') },
  {
    name: '../_shared/whatsappMediaStorage.ts',
    local: path.join(fnRoot, '_shared', 'whatsappMediaStorage.ts'),
  },
  {
    name: '../_shared/whatsappOutbound.ts',
    local: path.join(fnRoot, '_shared', 'whatsappOutbound.ts'),
  },
  {
    name: '../_shared/whatsappIdentity.ts',
    local: path.join(fnRoot, '_shared', 'whatsappIdentity.ts'),
  },
];

const args = {
  project_id: 'djzwjaegxbhlefanmmee',
  name: 'send-whatsapp-chat-message',
  entrypoint_path: 'index.ts',
  verify_jwt: true,
  files: files.map(({ name, local }) => ({
    name,
    content: stripBom(fs.readFileSync(local, 'utf8')),
  })),
};

const outPath =
  process.argv[2] ??
  path.join(
    process.env.USERPROFILE ?? '',
    '.cursor',
    'projects',
    'c-Users-Prosavis-Documents-GitHub-Prosavis-App',
    'agent-tools',
    '_deploy-send-whatsapp-chat-message-now.json',
  );

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(args), 'utf8');

const hasPlaceholder = args.files.some((f) => f.content.includes('PLACEHOLDER'));
console.log(
  JSON.stringify({
    outPath,
    fileCount: args.files.length,
    totalBytes: args.files.reduce((s, f) => s + f.content.length, 0),
    hasPlaceholder,
    names: args.files.map((f) => f.name),
  }),
);
