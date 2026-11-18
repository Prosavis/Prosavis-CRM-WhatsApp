import { patchFirestoreDocument, runFirestoreQuery } from './firebaseAdminRest.ts';

type AliasClient = {
  from: (table: string) => {
    select: (columns: string) => {
      is: (column: string, value: null) => {
        limit: (count: number) => Promise<{
          data: AliasRow[] | null;
          error: { message: string } | null;
        }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

type AliasRow = {
  old_id: string;
  canonical_client_id: string;
  app_user_id: string | null;
};

async function appointmentsWithClientId(clientId: string) {
  return runFirestoreQuery('appointments', {
    where: {
      fieldFilter: {
        field: { fieldPath: 'clientId' },
        op: 'EQUAL',
        value: { stringValue: clientId },
      },
    },
    limit: 200,
  });
}

async function reassignOne(row: AliasRow): Promise<number> {
  let moved = 0;
  for (let page = 0; page < 20; page += 1) {
    const docs = await appointmentsWithClientId(row.old_id);
    if (docs.length === 0) break;
    const fields: Record<string, unknown> = { clientId: row.canonical_client_id };
    if (row.app_user_id) fields.clientAppUserId = row.app_user_id;
    for (const doc of docs) {
      if (String(doc.data.clientId ?? '') === row.canonical_client_id) continue;
      await patchFirestoreDocument('appointments', doc.id, fields);
      moved += 1;
    }
    if (docs.length < 200) break;
  }
  return moved;
}

/** Reescribe appointments.clientId de fichas ya fusionadas. */
export async function applyPendingDirectoryClientAliases(
  supabase: AliasClient,
): Promise<{ aliases: number; appointments: number }> {
  const { data, error } = await supabase
    .from('crm_directory_client_id_alias')
    .select('old_id, canonical_client_id, app_user_id')
    .is('applied_at', null)
    .limit(50);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  let appointments = 0;
  for (const row of rows) {
    if (row.old_id && row.canonical_client_id && row.old_id !== row.canonical_client_id) {
      appointments += await reassignOne(row);
      const bookings = await supabase
        .from('bookings')
        .update({
          client_id: row.canonical_client_id,
          client_app_user_id: row.app_user_id,
        })
        .eq('client_id', row.old_id);
      if (bookings.error) throw new Error(bookings.error.message);
    }
    if (!row.old_id) continue;
    const marked = await supabase
      .from('crm_directory_client_id_alias')
      .update({ applied_at: new Date().toISOString() })
      .eq('old_id', row.old_id);
    if (marked.error) throw new Error(marked.error.message);
  }
  return { aliases: rows.length, appointments };
}
