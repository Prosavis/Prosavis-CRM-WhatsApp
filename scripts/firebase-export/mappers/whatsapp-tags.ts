import { loadAllDocs } from '../lib/firestore-reader.js';
import {
  mapAdminUid,
  persistIdMap,
  rememberTagId,
  type MigrationContext,
} from '../lib/migration-context.js';
import { firebaseIdToUuid } from '../lib/id-mapper.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migrateWhatsappTags(
  ctx: MigrationContext,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllDocs('whatsapp_chat_tags');
  const rows: Record<string, unknown>[] = [];
  const idMapEntries: Array<{ firebaseId: string; supabaseId: string }> = [];

  for (const doc of docs) {
    const data = doc.data();
    const supabaseId = firebaseIdToUuid('whatsapp_chat_tags', doc.id);
    rememberTagId(ctx, doc.id, supabaseId);
    idMapEntries.push({ firebaseId: doc.id, supabaseId });

    rows.push({
      id: supabaseId,
      name: data.name ?? doc.id,
      color: data.color ?? null,
      created_by: mapAdminUid(ctx, data.createdBy as string | undefined),
      archived: data.archived === true,
      created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
    });
  }

  if (options.dryRun) {
    return { table: 'whatsapp_chat_tags', attempted: rows.length, upserted: 0, errors: [] };
  }

  if (!options.dryRun) {
    for (const entry of idMapEntries) {
      await persistIdMap('whatsapp_chat_tags', entry.firebaseId, entry.supabaseId);
    }
  }

  return upsertRows('whatsapp_chat_tags', rows, { onConflict: 'id' });
}
