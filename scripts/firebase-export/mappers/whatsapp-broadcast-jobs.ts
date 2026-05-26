import { loadAllDocs } from '../lib/firestore-reader.js';
import { mapAdminUid, type MigrationContext } from '../lib/migration-context.js';
import { firebaseIdToUuid } from '../lib/id-mapper.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migrateBroadcastJobs(
  ctx: MigrationContext,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllDocs('whatsapp_broadcast_jobs');
  const rows: Record<string, unknown>[] = [];

  for (const doc of docs) {
    const data = doc.data();
    rows.push({
      id: firebaseIdToUuid('whatsapp_broadcast_jobs', doc.id),
      status: data.status ?? 'processing',
      total_recipients: data.totalRecipients ?? data.total ?? 0,
      sent: data.sent ?? 0,
      failed: data.failed ?? 0,
      skipped: data.skipped ?? 0,
      template_name: data.templateName ?? null,
      rich_body_preview: data.richBodyPreview ?? data.bodyPreview ?? null,
      created_by: mapAdminUid(ctx, (data.createdBy ?? data.createdByUid) as string | undefined),
      created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
      updated_at: firestoreTimestampToIso(data.updatedAt ?? data.createdAt) ?? new Date().toISOString(),
      completed_at: firestoreTimestampToIso(data.completedAt),
    });
  }

  if (options.dryRun) {
    return { table: 'whatsapp_broadcast_jobs', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('whatsapp_broadcast_jobs', rows, { onConflict: 'id' });
}
