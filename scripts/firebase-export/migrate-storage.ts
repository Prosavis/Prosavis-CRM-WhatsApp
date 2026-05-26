#!/usr/bin/env node

/**
 * Backfill Firebase Storage → Supabase Storage.
 * Modos:
 * - Referenciado (default): solo rutas en Firestore (actualiza Postgres).
 * - --full-prefix: además copia todos los objetos GCS bajo --prefix= (huérfanos, sin fila Postgres).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { getOutputDir } from './lib/config.js';
import { getSupabaseAdmin } from './lib/admin-mapper.js';
import { getFirebaseStorage, initFirebaseAdmin, iterateCollectionOrdered } from './lib/firestore-reader.js';
import { firebaseIdToUuid } from './lib/id-mapper.js';

type StorageJob = {
  sourcePath: string;
  bucket: 'whatsapp-media' | 'whatsapp-stickers' | 'crm-contact-photos';
  table: string;
  rowId: string;
  idColumn?: string;
  pathColumn: string;
  urlColumn?: string;
};

type StorageError = {
  sourcePath: string;
  bucket: string;
  error: string;
  kind: 'referenced' | 'orphan';
};

const BUCKET_MAP: Record<StorageJob['bucket'], string> = {
  'whatsapp-media': 'whatsapp-media',
  'whatsapp-stickers': 'whatsapp-stickers',
  'crm-contact-photos': 'crm-contact-photos',
};

const PREFIX_TO_BUCKET: Record<string, StorageJob['bucket']> = {
  'whatsapp-media/': 'whatsapp-media',
  'whatsapp-media': 'whatsapp-media',
  'whatsapp-stickers/': 'whatsapp-stickers',
  'whatsapp-stickers': 'whatsapp-stickers',
  'crm-contact-photos/': 'crm-contact-photos',
  'crm-contact-photos': 'crm-contact-photos',
};

function normalizeStoragePath(raw: string): string {
  return raw.replace(/^\/+/, '').replace(/^gs:\/\/[^/]+\//, '');
}

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes('--dry-run'),
    limit: Number(argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 0) || undefined,
    prefix: argv.find((a) => a.startsWith('--prefix='))?.split('=')[1],
    fullPrefix: argv.includes('--full-prefix'),
  };
}

async function collectReferencedJobs(limit?: number, prefix?: string): Promise<StorageJob[]> {
  const { db } = initFirebaseAdmin();
  const jobs = new Map<string, StorageJob>();

  const addJob = (job: StorageJob) => {
    if (prefix && !job.sourcePath.startsWith(prefix.replace(/\/$/, ''))) return;
    jobs.set(`${job.bucket}:${job.sourcePath}`, job);
  };

  const stickersSnap = await db.collection('whatsapp_stickers').get();
  for (const doc of stickersSnap.docs) {
    const storagePath = doc.data().storagePath as string | undefined;
    if (!storagePath) continue;
    addJob({
      sourcePath: normalizeStoragePath(storagePath),
      bucket: 'whatsapp-stickers',
      table: 'whatsapp_stickers',
      rowId: doc.id,
      pathColumn: 'storage_path',
      urlColumn: 'download_url',
    });
  }

  for await (const batch of iterateCollectionOrdered('whatsapp_message_log', 'createdAt', 500)) {
    for (const doc of batch) {
      const data = doc.data();
      const storagePath = data.storagePath as string | undefined;
      if (!storagePath) continue;
      addJob({
        sourcePath: normalizeStoragePath(storagePath),
        bucket: 'whatsapp-media',
        table: 'whatsapp_message_log',
        rowId: firebaseIdToUuid('whatsapp_message_log', doc.id),
        pathColumn: 'storage_path',
        urlColumn: 'storage_url',
      });
    }
  }

  const list = [...jobs.values()];
  return limit ? list.slice(0, limit) : list;
}

async function listGcsPaths(prefix: string): Promise<string[]> {
  const bucket = getFirebaseStorage().bucket();
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
  const [files] = await bucket.getFiles({ prefix: normalizedPrefix });
  return files.map((file) => file.name).filter((name) => !name.endsWith('/'));
}

function bucketForPrefix(prefix: string): StorageJob['bucket'] {
  const key = prefix.endsWith('/') ? prefix : `${prefix}/`;
  const bucket = PREFIX_TO_BUCKET[key] ?? PREFIX_TO_BUCKET[prefix.replace(/\/$/, '')];
  if (!bucket) {
    throw new Error(`No hay bucket Supabase mapeado para prefix=${prefix}`);
  }
  return bucket;
}

async function migrateReferencedJob(
  job: StorageJob,
  dryRun: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (dryRun) return { ok: true };

  const bucket = getFirebaseStorage().bucket();
  const file = bucket.file(job.sourcePath);
  const [exists] = await file.exists();
  if (!exists) {
    return { ok: false, error: 'Objeto no encontrado en Firebase Storage' };
  }

  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();
  const contentType = metadata.contentType ?? 'application/octet-stream';
  const destination = job.sourcePath;
  const supabase = getSupabaseAdmin();
  const bucketId = BUCKET_MAP[job.bucket];

  const { error: uploadError } = await supabase.storage
    .from(bucketId)
    .upload(destination, buffer, { upsert: true, contentType });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const updatePayload: Record<string, unknown> = {
    [job.pathColumn]: destination,
  };

  if (job.urlColumn) {
    const { data: publicData } = supabase.storage.from(bucketId).getPublicUrl(destination);
    updatePayload[job.urlColumn] = publicData.publicUrl;
  }

  const { error: updateError } = await supabase
    .from(job.table)
    .update(updatePayload)
    .eq(job.idColumn ?? 'id', job.rowId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  return { ok: true };
}

async function copyOrphanObject(
  sourcePath: string,
  bucket: StorageJob['bucket'],
  dryRun: boolean
): Promise<{ ok: boolean; error?: string }> {
  if (dryRun) return { ok: true };

  const gcsBucket = getFirebaseStorage().bucket();
  const file = gcsBucket.file(sourcePath);
  const [exists] = await file.exists();
  if (!exists) {
    return { ok: false, error: 'Objeto no encontrado en Firebase Storage' };
  }

  const [buffer] = await file.download();
  const [metadata] = await file.getMetadata();
  const contentType = metadata.contentType ?? 'application/octet-stream';
  const supabase = getSupabaseAdmin();
  const bucketId = BUCKET_MAP[bucket];

  const { error: uploadError } = await supabase.storage
    .from(bucketId)
    .upload(sourcePath, buffer, { upsert: true, contentType });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  return { ok: true };
}

async function main(): Promise<void> {
  const { dryRun, limit, prefix, fullPrefix } = parseArgs(process.argv.slice(2));

  initFirebaseAdmin();

  console.log('=== Migración Storage Firebase → Supabase ===');
  console.log(
    `${dryRun ? 'DRY-RUN' : 'LIVE'}${prefix ? ` | prefix=${prefix}` : ''}${fullPrefix ? ' | full-prefix=ON' : ''}${limit ? ` | limit=${limit}` : ''}`
  );

  const referencedJobs = await collectReferencedJobs(limit, prefix);
  const referencedPaths = new Set(referencedJobs.map((j) => j.sourcePath));

  console.log(`\nObjetos referenciados en Firestore: ${referencedJobs.length}`);

  let migratedReferenced = 0;
  const errors: StorageError[] = [];

  for (const job of referencedJobs) {
    const result = await migrateReferencedJob(job, dryRun);
    if (result.ok) {
      migratedReferenced += 1;
      console.log(`  OK [ref] ${job.bucket}/${job.sourcePath}`);
    } else {
      errors.push({
        sourcePath: job.sourcePath,
        bucket: job.bucket,
        error: result.error ?? 'Error desconocido',
        kind: 'referenced',
      });
      console.error(`  ERR [ref] ${job.bucket}/${job.sourcePath}: ${result.error}`);
    }
  }

  let orphanPaths: string[] = [];
  let migratedOrphans = 0;

  if (fullPrefix && prefix) {
    const gcsPaths = await listGcsPaths(prefix);
    orphanPaths = gcsPaths.filter((path) => !referencedPaths.has(path));
    if (limit) {
      orphanPaths = orphanPaths.slice(0, Math.max(0, limit - referencedJobs.length));
    }

    console.log(`\nObjetos huérfanos bajo ${prefix}: ${orphanPaths.length} (GCS total: ${gcsPaths.length})`);

    const targetBucket = bucketForPrefix(prefix);

    for (const sourcePath of orphanPaths) {
      const result = await copyOrphanObject(sourcePath, targetBucket, dryRun);
      if (result.ok) {
        migratedOrphans += 1;
        console.log(`  OK [orphan] ${targetBucket}/${sourcePath}`);
      } else {
        errors.push({
          sourcePath,
          bucket: targetBucket,
          error: result.error ?? 'Error desconocido',
          kind: 'orphan',
        });
        console.error(`  ERR [orphan] ${targetBucket}/${sourcePath}: ${result.error}`);
      }
    }
  }

  const outputDir = getOutputDir();
  mkdirSync(outputDir, { recursive: true });
  const reportPath = resolve(outputDir, `storage-migration-${Date.now()}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        dryRun,
        prefix: prefix ?? null,
        fullPrefix,
        referenced: {
          attempted: referencedJobs.length,
          migrated: migratedReferenced,
        },
        orphans: {
          attempted: orphanPaths.length,
          migrated: migratedOrphans,
        },
        errors,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`\nReferenciados: ${migratedReferenced}/${referencedJobs.length}`);
  if (fullPrefix) {
    console.log(`Huérfanos: ${migratedOrphans}/${orphanPaths.length}`);
  }
  console.log(`Errores: ${errors.length}`);
  console.log(`Reporte: ${reportPath}`);

  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Error en migrate-storage:', error);
  process.exit(1);
});
