import { loadAllDocs } from '../lib/firestore-reader.js';
import { mapAdminUid, type MigrationContext } from '../lib/migration-context.js';
import { firebaseIdToUuid } from '../lib/id-mapper.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migrateDiscountCodes(
  ctx: MigrationContext,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllDocs('discount_codes');
  const rows: Record<string, unknown>[] = [];

  for (const doc of docs) {
    const data = doc.data();
    rows.push({
      id: firebaseIdToUuid('discount_codes', doc.id),
      code: data.code ?? doc.id,
      discount_type: data.discountType ?? 'fixed_cop',
      discount_percent: data.discountPercent ?? null,
      discount_amount_cop: data.discountAmountCOP ?? 0,
      max_redemptions: data.maxRedemptions ?? null,
      redemption_count: data.redemptionCount ?? 0,
      description: data.description ?? null,
      status: data.status ?? 'active',
      created_by: mapAdminUid(ctx, data.createdBy as string | undefined),
      redeemed_by: data.redeemedBy ?? data.lastRedeemedBy ?? null,
      redeemed_at: firestoreTimestampToIso(data.redeemedAt ?? data.lastRedeemedAt),
      appointment_id: data.appointmentId ?? null,
      payment_id: data.paymentId ?? data.lastPaymentId ?? null,
      created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
      updated_at: firestoreTimestampToIso(data.updatedAt ?? data.createdAt) ?? new Date().toISOString(),
    });
  }

  if (options.dryRun) {
    return { table: 'crm_discount_codes', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('crm_discount_codes', rows, { onConflict: 'id' });
}
