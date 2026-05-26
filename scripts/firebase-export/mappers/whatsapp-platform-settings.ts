import { initFirebaseAdmin } from '../lib/firestore-reader.js';
import { mapAdminUid, type MigrationContext } from '../lib/migration-context.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migratePlatformSettings(
  ctx: MigrationContext,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const { db } = initFirebaseAdmin();
  const doc = await db.doc('platform_settings/whatsapp_automation').get();

  if (!doc.exists) {
    return {
      table: 'platform_settings',
      attempted: 0,
      upserted: 0,
      errors: [],
      warnings: ['platform_settings/whatsapp_automation no existe — se omite'],
    };
  }

  const data = doc.data() ?? {};
  const rows = [
    {
      key: 'whatsapp_automation',
      value: {
        geminiInboundEnabled: data.geminiInboundEnabled !== false,
        ...(data.updatedAt ? { migratedFromFirebase: true } : {}),
      },
      updated_by: mapAdminUid(ctx, data.updatedBy as string | undefined),
      updated_at: firestoreTimestampToIso(data.updatedAt) ?? new Date().toISOString(),
    },
  ];

  if (options.dryRun) {
    return { table: 'platform_settings', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('platform_settings', rows, { onConflict: 'key' });
}
