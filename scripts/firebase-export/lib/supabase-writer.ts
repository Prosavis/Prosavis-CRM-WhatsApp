import { getSupabaseAdmin } from './admin-mapper.js';
import type { IdMapEntry } from './id-mapper.js';

export type UpsertOptions = {
  onConflict: string;
  batchSize?: number;
};

export type UpsertResult = {
  table: string;
  attempted: number;
  upserted: number;
  errors: string[];
};

async function upsertSingleRow(
  table: string,
  row: Record<string, unknown>,
  onConflict: string
): Promise<string | null> {
  const client = getSupabaseAdmin();
  const { error } = await client.from(table).upsert(row, { onConflict });
  return error?.message ?? null;
}

export async function upsertRows<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  options: UpsertOptions
): Promise<UpsertResult> {
  const client = getSupabaseAdmin();
  const batchSize = options.batchSize ?? 500;
  const result: UpsertResult = {
    table,
    attempted: rows.length,
    upserted: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await client.from(table).upsert(chunk as Record<string, unknown>[], {
      onConflict: options.onConflict,
    });

    if (error) {
      for (const row of chunk) {
        const rowError = await upsertSingleRow(table, row as Record<string, unknown>, options.onConflict);
        if (rowError) {
          result.errors.push(rowError);
        } else {
          result.upserted += 1;
        }
      }
    } else {
      result.upserted += chunk.length;
    }
  }

  return result;
}

export async function upsertIdMap(entries: IdMapEntry[]): Promise<UpsertResult> {
  return upsertRows('migration_id_map', entries, {
    onConflict: 'source_collection,firebase_id',
  });
}

export async function getTableRowCount(table: string): Promise<number | null> {
  const client = getSupabaseAdmin();
  const { count, error } = await client
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.warn(`No se pudo contar ${table}: ${error.message}`);
    return null;
  }
  return count;
}

export async function loadConversationStableKeys(): Promise<Set<string>> {
  const client = getSupabaseAdmin();
  const keys = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from('whatsapp_conversations')
      .select('stable_key')
      .range(from, from + pageSize - 1);

    if (error) {
      console.warn(`No se pudieron cargar stable_key de conversaciones: ${error.message}`);
      break;
    }

    if (!data?.length) break;

    for (const row of data) {
      if (row.stable_key) keys.add(row.stable_key as string);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return keys;
}

export async function loadExistingWaMessageIds(): Promise<Set<string>> {
  const client = getSupabaseAdmin();
  const ids = new Set<string>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await client
      .from('whatsapp_message_log')
      .select('wa_message_id')
      .not('wa_message_id', 'is', null)
      .range(from, from + pageSize - 1);

    if (error) {
      console.warn(`No se pudieron cargar wa_message_id existentes: ${error.message}`);
      break;
    }

    if (!data?.length) break;

    for (const row of data) {
      const waId = row.wa_message_id as string | null;
      if (waId) ids.add(waId);
    }

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return ids;
}
