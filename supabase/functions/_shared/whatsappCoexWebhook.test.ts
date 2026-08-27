import { assertEquals } from 'jsr:@std/assert';
import {
  BOT_PHONE_NUMBER_ID,
  COMMERCIAL_PHONE_NUMBER_ID,
  conversationStableKey,
} from './whatsappLines.ts';
import {
  COMMERCIAL_ORPHAN_STATUS_STUB,
  parseCoexCustomerPhone,
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
