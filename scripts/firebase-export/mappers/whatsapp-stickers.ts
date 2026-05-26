import { loadAllDocs } from '../lib/firestore-reader.js';
import { mapAdminUid, type MigrationContext } from '../lib/migration-context.js';
import { firebaseIdToUuid } from '../lib/id-mapper.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

function mapFavoriteUids(
  ctx: MigrationContext,
  uids: unknown
): string[] {
  if (!Array.isArray(uids)) return [];
  return uids
    .map((uid) => (typeof uid === 'string' ? mapAdminUid(ctx, uid) : null))
    .filter((id): id is string => id != null);
}

export async function migrateStickers(
  ctx: MigrationContext,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllDocs('whatsapp_stickers');
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const doc of docs) {
    const data = doc.data();
    const storagePath = data.storagePath as string | undefined;
    if (!storagePath) {
      skipped += 1;
      continue;
    }

    rows.push({
      id: firebaseIdToUuid('whatsapp_stickers', doc.id),
      name: data.name ?? doc.id,
      storage_path: storagePath,
      download_url: data.downloadUrl ?? null,
      mime_type: data.mimeType ?? 'image/webp',
      size_bytes: data.sizeBytes ?? null,
      is_animated: data.isAnimated === true,
      favorite_by_uids: mapFavoriteUids(ctx, data.favoriteByUids),
      created_by: mapAdminUid(ctx, (data.createdByUid ?? data.createdBy) as string | undefined),
      archived: data.archived === true,
      created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
      updated_at: firestoreTimestampToIso(data.updatedAt ?? data.createdAt) ?? new Date().toISOString(),
    });
  }

  if (options.dryRun) {
    return { table: 'whatsapp_stickers', attempted: rows.length, upserted: 0, errors: [], skipped };
  }

  const result = await upsertRows('whatsapp_stickers', rows, { onConflict: 'id' });
  return { ...result, skipped };
}
