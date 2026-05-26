import { loadAllDocs } from '../lib/firestore-reader.js';
import { mapAdminUid, type MigrationContext } from '../lib/migration-context.js';
import { firebaseIdToUuid } from '../lib/id-mapper.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migrateIaTemplates(
  ctx: MigrationContext,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllDocs('whatsapp_ia_templates');
  const rows: Record<string, unknown>[] = [];

  for (const doc of docs) {
    const data = doc.data();
    rows.push({
      id: firebaseIdToUuid('whatsapp_ia_templates', doc.id),
      name: (data.label ?? data.name ?? doc.id) as string,
      body: data.body ?? '',
      variables: Array.isArray(data.variables) ? data.variables : [],
      created_by: mapAdminUid(ctx, (data.createdBy ?? data.createdByUid) as string | undefined),
      archived: data.archived === true,
      created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
      updated_at: firestoreTimestampToIso(data.updatedAt ?? data.createdAt) ?? new Date().toISOString(),
    });
  }

  if (options.dryRun) {
    return { table: 'whatsapp_ia_templates', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('whatsapp_ia_templates', rows, { onConflict: 'id' });
}
