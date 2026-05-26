import { loadAllDocs } from '../lib/firestore-reader.js';
import { mapAdminUid, type MigrationContext } from '../lib/migration-context.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migrateBlocklist(
  ctx: MigrationContext,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllDocs('whatsapp_blocklist');
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const doc of docs) {
    const data = doc.data();
    const phone = (data.phone as string | undefined) ?? doc.id;
    if (!phone?.trim()) {
      skipped += 1;
      continue;
    }

    rows.push({
      phone: phone.trim(),
      reason: data.reason ?? null,
      created_by: mapAdminUid(ctx, (data.createdBy ?? data.createdByUid) as string | undefined),
      created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
      stable_key: data.stableKey ?? doc.id,
      bsuid: data.bsuid ?? null,
    });
  }

  if (options.dryRun) {
    return { table: 'whatsapp_blocklist', attempted: rows.length, upserted: 0, errors: [], skipped };
  }

  const result = await upsertRows('whatsapp_blocklist', rows, { onConflict: 'phone' });
  return { ...result, skipped };
}
