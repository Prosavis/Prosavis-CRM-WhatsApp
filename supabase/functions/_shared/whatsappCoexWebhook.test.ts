import { assertEquals } from 'jsr:@std/assert';
import {
  BOT_PHONE_NUMBER_ID,
  COMMERCIAL_PHONE_NUMBER_ID,
  conversationStableKey,
} from './whatsappLines.ts';
import {
  COMMERCIAL_ORPHAN_STATUS_STUB,
  captureCtwaClick,
  ctwaReferralFromMessage,
  parseCoexCustomerPhone,
  persistCoexMessage,
  shouldIgnoreBotCoexField,
  shouldPersistCommercialOrphanStatus,
  shouldSkipMissingCommercialStatus,
  shouldUpgradeCoexStub,
} from './whatsappCoexWebhook.ts';

Deno.test('Coex fields on the bot line are ignored', () => {
  assertEquals(shouldIgnoreBotCoexField('smb_message_echoes', BOT_PHONE_NUMBER_ID), true);
  assertEquals(shouldIgnoreBotCoexField('history', BOT_PHONE_NUMBER_ID), true);
  assertEquals(shouldIgnoreBotCoexField('messages', BOT_PHONE_NUMBER_ID), false);
  assertEquals(shouldIgnoreBotCoexField('smb_message_echoes', COMMERCIAL_PHONE_NUMBER_ID), false);
});

Deno.test('same customer on two phone_number_id values does not collide', () => {
  const customer = '573146283332';
  const bot = conversationStableKey(customer, BOT_PHONE_NUMBER_ID);
  const commercial = conversationStableKey(customer, COMMERCIAL_PHONE_NUMBER_ID);
  assertEquals(bot, customer);
  assertEquals(commercial.startsWith(`${customer}__`), true);
  assertEquals(bot === commercial, false);
});

Deno.test('app echoes resolve the customer as the recipient', () => {
  const parsed = parseCoexCustomerPhone(
    { from: '573112121108', to: '573146283332', id: 'wamid.1' },
    COMMERCIAL_PHONE_NUMBER_ID,
  );
  assertEquals(parsed, { customerPhone: '573146283332', direction: 'outbound' });
});

Deno.test('history uses thread customer as authoritative identity for inbound', () => {
  const parsed = parseCoexCustomerPhone(
    {
      from: '573146283332',
      to: '573112121108',
      from_me: false,
      id: 'wamid.history.inbound',
    },
    COMMERCIAL_PHONE_NUMBER_ID,
    '573146283332',
  );
  assertEquals(parsed, { customerPhone: '573146283332', direction: 'inbound' });
});

Deno.test('history uses thread customer as authoritative identity for outbound', () => {
  const parsed = parseCoexCustomerPhone(
    {
      from: '573112121108',
      to: '573146283332',
      from_me: true,
      id: 'wamid.history.outbound',
    },
    COMMERCIAL_PHONE_NUMBER_ID,
    '573146283332',
  );
  assertEquals(parsed, { customerPhone: '573146283332', direction: 'outbound' });
});

Deno.test('official Meta history outbound has no to or from_me', () => {
  const parsed = parseCoexCustomerPhone(
    {
      from: '15550783881',
      id: 'wamid.history.official.outbound',
      timestamp: '1759351100',
      type: 'text',
      text: { body: 'Hello' },
    },
    COMMERCIAL_PHONE_NUMBER_ID,
    '16505551234',
  );
  assertEquals(parsed, { customerPhone: '16505551234', direction: 'outbound' });
});

Deno.test('official Meta history inbound uses from === thread.id', () => {
  const parsed = parseCoexCustomerPhone(
    {
      from: '16505551234',
      id: 'wamid.history.official.inbound',
      timestamp: '1759351101',
      type: 'text',
      text: { body: 'Hi' },
    },
    COMMERCIAL_PHONE_NUMBER_ID,
    '16505551234',
  );
  assertEquals(parsed, { customerPhone: '16505551234', direction: 'inbound' });
});

Deno.test('commercial orphan statuses persist only with recipient and 311', () => {
  assertEquals(
    shouldPersistCommercialOrphanStatus({
      phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID,
      recipientId: '573246549657',
      waMessageId: 'wamid.1',
    }),
    true,
  );
  assertEquals(
    shouldPersistCommercialOrphanStatus({
      phoneNumberId: BOT_PHONE_NUMBER_ID,
      recipientId: '573246549657',
      waMessageId: 'wamid.1',
    }),
    false,
  );
  assertEquals(
    shouldPersistCommercialOrphanStatus({
      phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID,
      recipientId: '',
      waMessageId: 'wamid.1',
    }),
    false,
  );
});

Deno.test('LID-only commercial statuses are skipped instead of failing the event', () => {
  assertEquals(
    shouldSkipMissingCommercialStatus({
      phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID,
      recipientId: '',
    }),
    true,
  );
  assertEquals(
    shouldSkipMissingCommercialStatus({
      phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID,
      recipientId: '573005653159',
    }),
    false,
  );
  assertEquals(
    shouldSkipMissingCommercialStatus({
      phoneNumberId: BOT_PHONE_NUMBER_ID,
      recipientId: '',
    }),
    false,
  );
});

Deno.test('echo replaces the Facebook/phone stub but not a real body', () => {
  assertEquals(
    shouldUpgradeCoexStub(COMMERCIAL_ORPHAN_STATUS_STUB, 'Ya le escribí al cliente'),
    true,
  );
  assertEquals(shouldUpgradeCoexStub('', 'Hola'), true);
  assertEquals(shouldUpgradeCoexStub('Hola', 'Otro texto'), false);
  assertEquals(
    shouldUpgradeCoexStub(COMMERCIAL_ORPHAN_STATUS_STUB, COMMERCIAL_ORPHAN_STATUS_STUB),
    false,
  );
});

type MemoryRow = Record<string, unknown>;

function createMemorySupabase(seed?: {
  messages?: MemoryRow[];
  conversations?: MemoryRow[];
}) {
  const tables: Record<string, MemoryRow[]> = {
    whatsapp_message_log: [...(seed?.messages ?? [])],
    whatsapp_conversations: [...(seed?.conversations ?? [])],
    whatsapp_media_assets: [],
  };

  const matches = (row: MemoryRow, filters: Array<[string, unknown]>) =>
    filters.every(([key, value]) => row[key] === value);

  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    let mode: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payload: MemoryRow | null = null;

    const run = () => {
      const list = tables[table] ?? [];
      if (mode === 'insert' && payload) {
        if (payload.wa_message_id && list.some((row) => row.wa_message_id === payload?.wa_message_id)) {
          return { data: null, error: { code: '23505' } };
        }
        const row = { id: `${table}-${list.length + 1}`, ...payload };
        list.push(row);
        tables[table] = list;
        return { data: row, error: null };
      }
      if (mode === 'update' && payload) {
        for (const row of list) {
          if (matches(row, filters)) Object.assign(row, payload);
        }
        return { data: null, error: null };
      }
      const row = list.find((item) => matches(item, filters)) ?? null;
      return { data: row, error: null };
    };

    const api: Record<string, unknown> = {
      select() {
        return api;
      },
      insert(row: MemoryRow) {
        mode = 'insert';
        payload = row;
        return api;
      },
      update(row: MemoryRow) {
        mode = 'update';
        payload = row;
        return api;
      },
      upsert(row: MemoryRow) {
        mode = 'upsert';
        const list = tables[table] ?? [];
        const existing = list.find((item) => item.stable_key === row.stable_key);
        if (existing) Object.assign(existing, row);
        else list.push({ ...row });
        tables[table] = list;
        return Promise.resolve({ error: null });
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return Object.assign(api, Promise.resolve(run()));
      },
      maybeSingle: async () => run(),
      single: async () => run(),
    };
    return api;
  };

  return {
    tables,
    from,
  };
}

Deno.test('text echo upgrades the commercial stub body', async () => {
  const waMessageId = 'wamid.echo.text';
  const db = createMemorySupabase({
    messages: [{
      id: 'stub-1',
      wa_message_id: waMessageId,
      message_body: COMMERCIAL_ORPHAN_STATUS_STUB,
      conversation_stable_key: conversationStableKey('573146283332', COMMERCIAL_PHONE_NUMBER_ID),
    }],
    conversations: [{
      stable_key: conversationStableKey('573146283332', COMMERCIAL_PHONE_NUMBER_ID),
      last_message_text: COMMERCIAL_ORPHAN_STATUS_STUB,
    }],
  });

  const status = await persistCoexMessage({
    supabase: db as never,
    phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID,
    defaultDirection: 'outbound',
    message: {
      id: waMessageId,
      from: '573112121108',
      to: '573146283332',
      timestamp: '1756300000',
      type: 'text',
      text: { body: 'respuesta prueba 2 desde panel de facebook cuenta nicolas' },
    },
  });

  assertEquals(status, 'updated');
  assertEquals(
    db.tables.whatsapp_message_log[0].message_body,
    'respuesta prueba 2 desde panel de facebook cuenta nicolas',
  );
});

Deno.test('image echo stores media_id without throwing', async () => {
  const db = createMemorySupabase();
  const status = await persistCoexMessage({
    supabase: db as never,
    phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID,
    defaultDirection: 'outbound',
    message: {
      id: 'wamid.echo.image',
      from: '573112121108',
      to: '573146283332',
      timestamp: '1756300001',
      type: 'image',
      image: { id: 'media-123', mime_type: 'image/jpeg', caption: 'foto del local' },
    },
  });

  assertEquals(status, 'inserted');
  assertEquals(db.tables.whatsapp_message_log[0].media_id, 'media-123');
  assertEquals(db.tables.whatsapp_message_log[0].media_type, 'image');
  assertEquals(db.tables.whatsapp_message_log[0].message_body, 'foto del local');
});

Deno.test('ctwa_clid is stored from an ad referral and the latest click wins', async () => {
  assertEquals(
    ctwaReferralFromMessage({
      referral: { source_type: 'ad', source_id: '111', ctwa_clid: 'clid-1' },
    }),
    { ctwaClid: 'clid-1', sourceId: '111' },
  );
  assertEquals(ctwaReferralFromMessage({ referral: { source_type: 'post', ctwa_clid: 'x' } }), null);
  assertEquals(ctwaReferralFromMessage({}), null);

  const db = createMemorySupabase();
  const stableKey = conversationStableKey('573146283332', COMMERCIAL_PHONE_NUMBER_ID);
  const first = await persistCoexMessage({
    supabase: db as never,
    phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID,
    defaultDirection: 'inbound',
    message: {
      id: 'wamid.ctwa.1',
      from: '573146283332',
      timestamp: '1756300003',
      type: 'text',
      text: { body: 'hola desde el anuncio' },
      referral: { source_type: 'ad', source_id: '111', ctwa_clid: 'clid-1' },
    },
  });
  assertEquals(first, 'inserted');
  assertEquals(db.tables.whatsapp_conversations[0].ctwa_clid, 'clid-1');
  assertEquals(db.tables.whatsapp_conversations[0].ctwa_source_id, '111');

  const second = await persistCoexMessage({
    supabase: db as never,
    phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID,
    defaultDirection: 'inbound',
    message: {
      id: 'wamid.ctwa.2',
      from: '573146283332',
      timestamp: '1756300004',
      type: 'text',
      text: { body: 'segundo mensaje' },
      referral: { source_type: 'ad', source_id: '222', ctwa_clid: 'clid-2' },
    },
  });
  assertEquals(second, 'inserted');
  assertEquals(db.tables.whatsapp_conversations[0].ctwa_clid, 'clid-2');
  assertEquals(db.tables.whatsapp_conversations[0].ctwa_source_id, '222');
  assertEquals(
    (db.tables.whatsapp_conversations[0].ctwa_clicks as MemoryRow[]).map((click) => click.ctwa_clid),
    ['clid-1'],
  );
});

Deno.test('bot thread keeps the click on a retry and moves the old one to history on a new ad', async () => {
  assertEquals(
    ctwaReferralFromMessage({ referral: { ctwa_clid: 'clid-bot' } }),
    { ctwaClid: 'clid-bot', sourceId: '' },
  );
  const db = createMemorySupabase({
    conversations: [{
      stable_key: conversationStableKey('573001112233', BOT_PHONE_NUMBER_ID),
      phone_number_id: BOT_PHONE_NUMBER_ID,
    }],
  });
  const stableKey = conversationStableKey('573001112233', BOT_PHONE_NUMBER_ID);
  const message = {
    id: 'wamid.bot.ctwa',
    referral: { source_id: 'simple-2', ctwa_clid: 'clid-bot' },
  };
  await captureCtwaClick({
    supabase: db as never,
    message,
    stableKey,
    direction: 'inbound',
  });
  assertEquals(db.tables.whatsapp_conversations[0].ctwa_clid, 'clid-bot');
  assertEquals(db.tables.whatsapp_conversations[0].ctwa_source_id, 'simple-2');
  const firstCapturedAt = db.tables.whatsapp_conversations[0].ctwa_captured_at;

  await captureCtwaClick({ supabase: db as never, message, stableKey, direction: 'inbound' });
  assertEquals(db.tables.whatsapp_conversations[0].ctwa_clid, 'clid-bot');
  assertEquals(db.tables.whatsapp_conversations[0].ctwa_captured_at, firstCapturedAt);
  assertEquals(db.tables.whatsapp_conversations[0].ctwa_clicks, undefined);

  await captureCtwaClick({
    supabase: db as never,
    message: { referral: { source_type: 'ad', source_id: 'home-office-b', ctwa_clid: 'clid-nuevo' } },
    stableKey,
    direction: 'inbound',
  });
  assertEquals(db.tables.whatsapp_conversations[0].ctwa_clid, 'clid-nuevo');
  assertEquals(db.tables.whatsapp_conversations[0].ctwa_source_id, 'home-office-b');
  assertEquals(db.tables.whatsapp_conversations[0].ctwa_clicks, [
    { ctwa_clid: 'clid-bot', ctwa_source_id: 'simple-2', ctwa_captured_at: firstCapturedAt },
  ]);

  await captureCtwaClick({ supabase: db as never, message, stableKey, direction: 'inbound' });
  assertEquals(db.tables.whatsapp_conversations[0].ctwa_clid, 'clid-nuevo');
});

Deno.test('echo without to does not throw', async () => {
  const db = createMemorySupabase();
  const status = await persistCoexMessage({
    supabase: db as never,
    phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID,
    defaultDirection: 'outbound',
    message: {
      id: 'wamid.echo.noto',
      from: '573112121108',
      timestamp: '1756300002',
      type: 'text',
      text: { body: 'sin destinatario' },
    },
  });
  assertEquals(status, 'skipped');
  assertEquals(db.tables.whatsapp_message_log.length, 0);
});
