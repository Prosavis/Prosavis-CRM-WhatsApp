import { loadAllDocs } from '../lib/firestore-reader.js';
import {
  persistIdMap,
  rememberLeadId,
} from '../lib/migration-context.js';
import type { MigrationContext } from '../lib/migration-context.js';
import { firebaseIdToUuid } from '../lib/id-mapper.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migrateLeads(
  ctx: MigrationContext,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  void ctx;
  const docs = await loadAllDocs('leads');
  const rows: Record<string, unknown>[] = [];

  for (const doc of docs) {
    const data = doc.data();
    const supabaseId = firebaseIdToUuid('leads', doc.id);
    rememberLeadId(ctx, doc.id, supabaseId);

    rows.push({
      id: supabaseId,
      phone: data.phone ?? null,
      email: data.email ?? null,
      name: data.name ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      user_id: data.userId ?? null,
      channels: Array.isArray(data.channels) ? data.channels : [],
      status: data.status ?? 'PENDIENTE',
      source: data.source ?? 'PANEL',
      fecha_primer_contacto: firestoreTimestampToIso(data.fecha_primer_contacto),
      fecha_ultimo_mensaje_enviado: firestoreTimestampToIso(data.fecha_ultimo_mensaje_enviado),
      mensajes_enviados: data.mensajes_enviados ?? 0,
      secuencia_activa: data.secuencia_activa ?? 'NINGUNA',
      secuencia_paso: data.secuencia_paso ?? 0,
      opt_out: data.opt_out === true,
      last_response_text: data.last_response_text ?? null,
      last_response_at: firestoreTimestampToIso(data.last_response_at),
      appointment_id: data.appointmentId ?? null,
      created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
      updated_at: firestoreTimestampToIso(data.updatedAt) ?? new Date().toISOString(),
    });
  }

  if (options.dryRun) {
    return { table: 'crm_leads', attempted: rows.length, upserted: 0, errors: [] };
  }

  for (const doc of docs) {
    const supabaseId = firebaseIdToUuid('leads', doc.id);
    await persistIdMap('leads', doc.id, supabaseId);
  }

  return upsertRows('crm_leads', rows, { onConflict: 'id' });
}
