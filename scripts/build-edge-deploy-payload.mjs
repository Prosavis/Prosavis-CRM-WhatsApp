#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const functionsDir = path.join(root, 'supabase', 'functions');
const projectId = 'djzwjaegxbhlefanmmee';

function read(rel) {
  return fs.readFileSync(path.join(functionsDir, rel), 'utf8');
}

function buildFiles(entryRel, extraShared = []) {
  const shared = [
    '_shared/cors.ts',
    '_shared/supabase.ts',
    '_shared/whatsappMediaStorage.ts',
    ...extraShared,
  ];
  const files = [
    { name: 'index.ts', content: read(entryRel) },
    ...shared.map((rel) => ({
      name: `../${rel}`,
      content: read(rel),
    })),
  ];
  return files;
}

const targets = [
  {
    name: 'get-whatsapp-media-url',
    entry: 'get-whatsapp-media-url/index.ts',
    verify_jwt: true,
    extra: [],
  },
  {
    name: 'on-whatsapp-webhook',
    entry: 'on-whatsapp-webhook/index.ts',
    verify_jwt: false,
    extra: [],
  },
  {
    name: 'send-whatsapp-chat-message',
    entry: 'send-whatsapp-chat-message/index.ts',
    verify_jwt: true,
    extra: ['_shared/whatsappOutbound.ts', '_shared/whatsappIdentity.ts'],
  },
  {
    name: 'send-whatsapp-media-batch',
    entry: 'send-whatsapp-media-batch/index.ts',
    verify_jwt: true,
    extra: ['_shared/whatsappOutbound.ts', '_shared/whatsappIdentity.ts'],
  },
];

const outDir = path.join(__dirname, '.edge-deploy-payloads');
fs.mkdirSync(outDir, { recursive: true });

for (const target of targets) {
  const payload = {
    project_id: projectId,
    name: target.name,
    entrypoint_path: 'index.ts',
    verify_jwt: target.verify_jwt,
    files: buildFiles(target.entry, target.extra),
  };
  const outPath = path.join(outDir, `${target.name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload));
  console.log(`Wrote ${outPath} (${payload.files.length} files)`);
}
