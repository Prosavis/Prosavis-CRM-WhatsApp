import { describe, expect, it } from 'vitest';
import {
  BOT_PHONE_NUMBER_ID,
  COMMERCIAL_PHONE_NUMBER_ID,
  conversationStableKey,
  customerPhoneFromStableKey,
  isCommercialStableKey,
  resolveWhatsAppLine,
  siblingConversationStableKey,
} from './whatsappLines';

const CUSTOMER = '573146283332';

describe('whatsappLines', () => {
  it('keeps bot conversation identity as the customer phone', () => {
    expect(conversationStableKey(CUSTOMER, BOT_PHONE_NUMBER_ID)).toBe(CUSTOMER);
    expect(resolveWhatsAppLine(BOT_PHONE_NUMBER_ID)).toBe('bot');
  });

  it('namespaces commercial conversations so they cannot overwrite the bot thread', () => {
    const key = conversationStableKey(CUSTOMER, COMMERCIAL_PHONE_NUMBER_ID);
    expect(key).toBe(`${CUSTOMER}__${COMMERCIAL_PHONE_NUMBER_ID}`);
    expect(isCommercialStableKey(key)).toBe(true);
    expect(customerPhoneFromStableKey(key)).toBe(CUSTOMER);
    expect(siblingConversationStableKey(CUSTOMER)).toBe(key);
    expect(siblingConversationStableKey(key)).toBe(CUSTOMER);
  });
});
