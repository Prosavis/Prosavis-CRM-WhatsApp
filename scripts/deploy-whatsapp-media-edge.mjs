#!/usr/bin/env node
/**
 * Despliega las Edge Functions tocadas por el fix de media WhatsApp.
 * Requiere: npx supabase login (o SUPABASE_ACCESS_TOKEN en el entorno).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const projectRef = 'djzwjaegxbhlefanmmee';

const functions = [
  'get-whatsapp-media-url',
  'on-whatsapp-webhook',
  'send-whatsapp-chat-message',
  'send-whatsapp-media-batch',
];

for (const name of functions) {
  console.log(`\n>>> Deploying ${name}...`);
  const result = spawnSync(
    'npx',
    ['supabase', 'functions', 'deploy', name, '--project-ref', projectRef],
    { cwd: root, stdio: 'inherit', shell: true },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('\nDeploy de Edge Functions completado.');
