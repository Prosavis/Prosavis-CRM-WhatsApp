import { loadAllDocs } from '../lib/firestore-reader.js';
import { mapAdminUid, type MigrationContext } from '../lib/migration-context.js';
import { firebaseIdToUuid } from '../lib/id-mapper.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migrateSnippets(
  ctx: MigrationContext,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllDocs('whatsapp_operator_snippets');
  const rows: Record<string, unknown>[] = [];

  for (const doc of docs) {
    const data = doc.data();
    const label = (data.label as string | undefined) ?? (data.title as string | undefined) ?? doc.id;
    const shortcut =
      (data.shortcut as string | undefined) ??
      `/${label.toLowerCase().replace(/\s+/g, '_')}`;

    rows.push({
      id: firebaseIdToUuid('whatsapp_operator_snippets', doc.id),
      title: label,
      body: data.body ?? '',
      shortcut,
      label,
      is_active: data.isActive !== false,
      created_by: mapAdminUid(ctx, (data.createdByUid ?? data.createdBy) as string | undefined),
      created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
      updated_at: firestoreTimestampToIso(data.updatedAt ?? data.createdAt) ?? new Date().toISOString(),
    });
  }

  if (options.dryRun) {
    return { table: 'whatsapp_snippets', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('whatsapp_snippets', rows, { onConflict: 'id' });
}
