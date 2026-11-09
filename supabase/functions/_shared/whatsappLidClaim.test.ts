import { assertEquals } from 'jsr:@std/assert';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  absorbDirectoryLidLinkedToPhone,
  claimLidConversationPhone,
} from './whatsappLidClaim.ts';

type Row = Record<string, unknown>;

function createMemorySupabase(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(seed)) {
    tables[name] = rows.map((row) => ({ ...row }));
  }
  for (const name of [
    'crm_directory',
    'whatsapp_conversations',
    'whatsapp_message_log',
    'whatsapp_media_assets',
  ]) {
    tables[name] ??= [];
  }

  function query(table: string) {
    const filters: Array<[string, unknown]> = [];
    const matches = () =>
      (tables[table] ?? []).filter((row) =>
        filters.every(([column, value]) => row[column] === value)
      );
    const api = {
      select() {
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return api;
      },
      maybeSingle() {
        return Promise.resolve({ data: matches()[0] ?? null, error: null });
      },
      insert(row: Row) {
        tables[table] = [...(tables[table] ?? []), { ...row }];
        return Promise.resolve({ error: null });
      },
      update(values: Row) {
        return {
          eq(column: string, value: unknown) {
            const nextFilters = [...filters, [column, value] as [string, unknown]];
            for (const row of tables[table] ?? []) {
              if (nextFilters.every(([c, v]) => row[c] === v)) Object.assign(row, values);
            }
            return Promise.resolve({ error: null });
          },
        };
      },
      delete() {
        return {
          eq(column: string, value: unknown) {
            const nextFilters = [...filters, [column, value] as [string, unknown]];
            tables[table] = (tables[table] ?? []).filter(
              (row) => !nextFilters.every(([c, v]) => row[c] === v),
            );
            return Promise.resolve({ error: null });
          },
        };
      },
    };
    return api;
  }

  return {
    tables,
    client: {
      from: (table: string) => query(table),
      rpc: () => Promise.resolve({ error: null }),
    } as unknown as SupabaseClient,
  };
}

const LID_KEY = 'lid:CO.1719788609662814';
const PHONE = '573186638852';
const BOT_LINE = '1035566289641219';

Deno.test('claim moves a LID-only chat onto the phone and keeps the directory row', async () => {
  const store = createMemorySupabase({
    crm_directory: [{
      id: 'dir-lid',
      phone: null,
      phone_key: null,
      whatsapp_conversation_id: LID_KEY,
    }],
    whatsapp_conversations: [{
      stable_key: LID_KEY,
      unread_count: 2,
      contact_name: 'Damaris Cerritos Campestre',
      last_message_text: 'Gracias',
      last_message_at: '2026-10-29T16:13:27.000Z',
      last_message_direction: 'inbound',
      metadata: { username: 'Damaher2' },
      phone_number_id: BOT_LINE,
      state: 'active',
    }],
    whatsapp_message_log: [{
      id: 'm1',
      conversation_stable_key: LID_KEY,
      recipient_phone: LID_KEY,
    }],
    whatsapp_media_assets: [{ id: 'a1', conversation_stable_key: LID_KEY }],
  });

  const result = await claimLidConversationPhone({
    supabase: store.client,
    userId: 'CO.1719788609662814',
    phone: '+573186638852',
    phoneNumberId: BOT_LINE,
  });

  assertEquals(result, { stableKey: PHONE, directoryId: 'dir-lid' });
  assertEquals(
    store.tables.whatsapp_conversations.map((row) => row.stable_key),
    [PHONE],
  );
  const conversation = store.tables.whatsapp_conversations[0];
  assertEquals(conversation?.phone, PHONE);
  assertEquals(conversation?.contact_phone, PHONE);
  assertEquals(conversation?.contact_name, 'Damaris Cerritos Campestre');
  const metadata = conversation?.metadata as Record<string, unknown>;
  assertEquals(metadata.lidUserId, 'CO.1719788609662814');
  assertEquals(metadata.remappedFromLid, LID_KEY);
  assertEquals(metadata.username, 'Damaher2');
  assertEquals(store.tables.whatsapp_message_log[0]?.conversation_stable_key, PHONE);
  assertEquals(store.tables.whatsapp_message_log[0]?.recipient_phone, PHONE);
  assertEquals(store.tables.whatsapp_media_assets[0]?.conversation_stable_key, PHONE);
  assertEquals(store.tables.crm_directory[0]?.id, 'dir-lid');
  assertEquals(store.tables.crm_directory[0]?.phone, PHONE);
  assertEquals(store.tables.crm_directory[0]?.whatsapp_conversation_id, PHONE);
});

Deno.test('claim folds a LID chat into the phone chat that already exists', async () => {
  const store = createMemorySupabase({
    crm_directory: [{
      id: 'dir-phone',
      phone: '+573186638852',
      phone_key: '3186638852',
      whatsapp_conversation_id: PHONE,
      address: 'Cerritos',
    }],
    whatsapp_conversations: [
      {
        stable_key: LID_KEY,
        unread_count: 3,
        contact_name: 'Damaris Cerritos Campestre',
        last_message_text: 'Gracias',
        last_message_at: '2026-10-29T16:13:27.000Z',
        last_message_direction: 'inbound',
        metadata: { username: 'Damaher2' },
        phone_number_id: BOT_LINE,
        state: 'active',
      },
      {
        stable_key: PHONE,
        phone: PHONE,
        contact_phone: PHONE,
        unread_count: 1,
        contact_name: 'Damaris Cerritos Campestre',
        last_message_text: 'Servicio finalizado',
        last_message_at: '2026-11-03T15:38:47.000Z',
        last_message_direction: 'outbound',
        metadata: { source: 'confirmacion' },
        phone_number_id: BOT_LINE,
      },
    ],
    whatsapp_message_log: [
      { id: 'lid-msg', conversation_stable_key: LID_KEY, recipient_phone: LID_KEY },
      { id: 'phone-msg', conversation_stable_key: PHONE, recipient_phone: PHONE },
    ],
    whatsapp_media_assets: [],
    ctwa_voice_nudges: [{ id: 'nudge-1', conversation_stable_key: LID_KEY, status: 'cancelled' }],
    whatsapp_conversation_ai_memory: [{ stable_key: LID_KEY, summary: 'cita cerritos' }],
  });

  const result = await claimLidConversationPhone({
    supabase: store.client,
    userId: 'CO.1719788609662814',
    phone: '3186638852',
    phoneNumberId: BOT_LINE,
  });

  assertEquals(result, { stableKey: PHONE, directoryId: 'dir-phone' });
  assertEquals(store.tables.crm_directory.length, 1);
  assertEquals(store.tables.crm_directory[0]?.id, 'dir-phone');
  assertEquals(store.tables.crm_directory[0]?.address, 'Cerritos');
  assertEquals(store.tables.crm_directory[0]?.whatsapp_conversation_id, PHONE);
  assertEquals(
    store.tables.whatsapp_conversations.map((row) => row.stable_key),
    [PHONE],
  );
  const conversation = store.tables.whatsapp_conversations[0];
  assertEquals(conversation?.unread_count, 4);
  assertEquals(conversation?.last_message_text, 'Servicio finalizado');
  const metadata = conversation?.metadata as Record<string, unknown>;
  assertEquals(metadata.lidUserId, 'CO.1719788609662814');
  assertEquals(metadata.remappedFromLid, LID_KEY);
  assertEquals(metadata.source, 'confirmacion');
  assertEquals(metadata.username, 'Damaher2');
  const byId = new Map(store.tables.whatsapp_message_log.map((row) => [row.id, row]));
  assertEquals(byId.get('lid-msg')?.conversation_stable_key, PHONE);
  assertEquals(byId.get('phone-msg')?.conversation_stable_key, PHONE);
  assertEquals(byId.get('phone-msg')?.recipient_phone, PHONE);
  assertEquals(store.tables.ctwa_voice_nudges?.[0]?.conversation_stable_key, PHONE);
  assertEquals(store.tables.whatsapp_conversation_ai_memory?.[0]?.stable_key, PHONE);
  assertEquals(store.tables.whatsapp_conversation_ai_memory?.[0]?.summary, 'cita cerritos');
});

Deno.test('outbound absorb claims a directory still linked to a LID thread', async () => {
  const store = createMemorySupabase({
    crm_directory: [{
      id: 'dir-lid',
      phone: '+573186638852',
      phone_key: '3186638852',
      whatsapp_conversation_id: LID_KEY,
    }],
    whatsapp_conversations: [{
      stable_key: LID_KEY,
      unread_count: 0,
      contact_name: 'Damaris Cerritos Campestre',
      last_message_at: '2026-10-29T16:13:27.000Z',
      metadata: {},
      phone_number_id: BOT_LINE,
      state: 'active',
    }],
    whatsapp_message_log: [],
    whatsapp_media_assets: [],
  });

  await absorbDirectoryLidLinkedToPhone({
    supabase: store.client,
    stableKey: PHONE,
    phoneNumberId: BOT_LINE,
  });

  assertEquals(
    store.tables.whatsapp_conversations.map((row) => row.stable_key),
    [PHONE],
  );
  assertEquals(store.tables.crm_directory[0]?.whatsapp_conversation_id, PHONE);
});

Deno.test('outbound absorb leaves a phone-linked directory alone', async () => {
  const store = createMemorySupabase({
    crm_directory: [{
      id: 'dir-phone',
      phone_key: '3186638852',
      whatsapp_conversation_id: PHONE,
    }],
    whatsapp_conversations: [{ stable_key: PHONE, phone: PHONE }],
    whatsapp_message_log: [],
    whatsapp_media_assets: [],
  });

  await absorbDirectoryLidLinkedToPhone({
    supabase: store.client,
    stableKey: PHONE,
    phoneNumberId: BOT_LINE,
  });

  assertEquals(
    store.tables.whatsapp_conversations.map((row) => row.stable_key),
    [PHONE],
  );
});
