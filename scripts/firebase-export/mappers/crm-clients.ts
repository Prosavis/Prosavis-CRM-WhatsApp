import { loadAllDocs } from '../lib/firestore-reader.js';
import { getSupabaseAdmin } from '../lib/admin-mapper.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migrateCrmClients(
  _ctx: unknown,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllDocs('crmClients');
  const rows = docs.map((doc) => {
    const data = doc.data();
    const logicalId = (data.id as string | undefined) ?? doc.id;

    return {
      // PK = doc.id Firestore (único por registro); citas/chats referencian logical_id
      id: doc.id,
      doc_id: (data.docId as string | undefined) ?? doc.id,
      provider_id: data.providerId ?? '',
      service_id: data.serviceId ?? '',
      name: data.name ?? '',
      email: data.email ?? null,
      phone: data.phone ?? null,
      photo_url: data.photoUrl ?? null,
      is_app_user: data.isAppUser === true,
      client_classification: data.clientClassification ?? null,
      quality_tag: data.qualityTag ?? null,
      otp_required: data.otpRequired ?? null,
      payment_status: data.paymentStatus ?? null,
      pending_amount: data.pendingAmount ?? null,
      pending_appointments_count: data.pendingAppointmentsCount ?? null,
      last_charged_amount: data.lastChargedAmount ?? null,
      preferred_service_address_line: data.preferredServiceAddressLine ?? null,
      preferred_service_address_reference: data.preferredServiceAddressReference ?? null,
      preferred_address_updated_at: firestoreTimestampToIso(data.preferredAddressUpdatedAt),
      internal_notes: data.internalNotes ?? null,
      metadata: { logical_id: logicalId },
      created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
      updated_at: firestoreTimestampToIso(data.updatedAt) ?? new Date().toISOString(),
    };
  });

  if (options.dryRun) {
    return { table: 'crm_clients', attempted: rows.length, upserted: 0, errors: [] };
  }

  // Elimina filas de la corrida anterior (PK = id lógico duplicado entre servicios)
  const client = getSupabaseAdmin();
  const { error: deleteError } = await client
    .from('crm_clients')
    .delete()
    .neq('id', '__impossible__');

  if (deleteError) {
    return {
      table: 'crm_clients',
      attempted: rows.length,
      upserted: 0,
      errors: [`No se pudo limpiar crm_clients: ${deleteError.message}`],
    };
  }

  return upsertRows('crm_clients', rows, { onConflict: 'id' });
}
