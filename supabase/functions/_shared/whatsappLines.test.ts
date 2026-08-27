import { assertEquals, assertThrows } from 'jsr:@std/assert';
import {
  BOT_PHONE_NUMBER_ID,
  COMMERCIAL_PHONE_NUMBER_ID,
  conversationStableKey,
  customerPhoneFromStableKey,
  isCommercialPhoneNumberId,
  isCommercialStableKey,
  resolveWhatsAppLine,
  siblingConversationStableKey,
  assertBotOnlyAutomation,
} from './whatsappLines.ts';

const CUSTOMER = '573146283332';

Deno.test('bot inbound keeps stable_key = customer phone', () => {
  assertEquals(conversationStableKey(CUSTOMER, BOT_PHONE_NUMBER_ID), CUSTOMER);
  assertEquals(conversationStableKey(CUSTOMER, null), CUSTOMER);
  assertEquals(resolveWhatsAppLine(BOT_PHONE_NUMBER_ID), 'bot');
});

Deno.test('commercial inbound uses composite stable_key', () => {
  const key = conversationStableKey(CUSTOMER, COMMERCIAL_PHONE_NUMBER_ID);
  assertEquals(key, `${CUSTOMER}__${COMMERCIAL_PHONE_NUMBER_ID}`);
  assertEquals(isCommercialStableKey(key), true);
  assertEquals(customerPhoneFromStableKey(key), CUSTOMER);
  assertEquals(resolveWhatsAppLine(COMMERCIAL_PHONE_NUMBER_ID), 'commercial');
  assertEquals(isCommercialPhoneNumberId(COMMERCIAL_PHONE_NUMBER_ID), true);
});

Deno.test('sibling keys point bot ↔ commercial without colliding', () => {
  const bot = conversationStableKey(CUSTOMER, BOT_PHONE_NUMBER_ID);
  const commercial = conversationStableKey(CUSTOMER, COMMERCIAL_PHONE_NUMBER_ID);
  assertEquals(siblingConversationStableKey(bot), commercial);
  assertEquals(siblingConversationStableKey(commercial), bot);
});

Deno.test('bot automation cannot target commercial line', () => {
  assertThrows(
    () => assertBotOnlyAutomation(COMMERCIAL_PHONE_NUMBER_ID),
    Error,
    'línea bot',
  );
  assertBotOnlyAutomation(BOT_PHONE_NUMBER_ID);
  assertBotOnlyAutomation(undefined);
});
