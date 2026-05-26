import { loadAllDocs } from '../lib/firestore-reader.js';
import { mapAdminUid, type MigrationContext } from '../lib/migration-context.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migrateOutboundBatches(
  ctx: MigrationContext,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllDocs('whatsapp_outbound_batches');
  const rows: Record<string, unknown>[] = [];

  for (const doc of docs) {
    const data = doc.data();
    rows.push({
      client_batch_id: doc.id,
      status: data.status ?? 'processing',
      to_key: data.to ?? data.toKey ?? '',
      phone_number_id: data.phoneNumberId ?? null,
      total: data.total ?? 0,
      sent: data.sent ?? 0,
      failed: data.failed ?? 0,
      results: Array.isArray(data.results) ? data.results : [],
      created_by: mapAdminUid(ctx, (data.createdBy ?? data.createdByUid) as string | undefined),
      created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
      updated_at: firestoreTimestampToIso(data.updatedAt ?? data.createdAt) ?? new Date().toISOString(),
      completed_at: firestoreTimestampToIso(data.completedAt),
    });
  }

  if (options.dryRun) {
    return { table: 'whatsapp_outbound_batches', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('whatsapp_outbound_batches', rows, { onConflict: 'client_batch_id' });
}
