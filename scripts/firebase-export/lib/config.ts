import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

loadEnv({ path: resolve(rootDir, '.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable de entorno requerida: ${name}`);
  }
  return value;
}

export function getFirebaseConfig() {
  return {
    projectId: requireEnv('FIREBASE_PROJECT_ID'),
    storageBucket:
      process.env.FIREBASE_STORAGE_BUCKET ?? `${requireEnv('FIREBASE_PROJECT_ID')}.appspot.com`,
  };
}

export function getSupabaseConfig() {
  return {
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function getOutputDir(): string {
  return process.env.MIGRATION_OUTPUT_DIR ?? resolve(rootDir, 'output');
}
