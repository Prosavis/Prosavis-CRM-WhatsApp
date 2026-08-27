import { assertEquals } from 'jsr:@std/assert';
import {
  BOT_PHONE_NUMBER_ID,
  COMMERCIAL_PHONE_NUMBER_ID,
  conversationStableKey,
} from './whatsappLines.ts';
import {
  parseCoexCustomerPhone,
  shouldIgnoreBotCoexField,
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
