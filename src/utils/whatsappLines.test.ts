import { describe, expect, it } from 'vitest';
import {
  BOT_PHONE_NUMBER_ID,
  COMMERCIAL_PHONE_NUMBER_ID,
  conversationStableKey,
  customerPhoneFromStableKey,
  isCommercialStableKey,
  isLidStableKey,
  isWhatsappLidIdentity,
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

  it('detects commercial LID threads that have no WhatsApp phone yet', () => {
    const key = conversationStableKey('lid:CO.2284278722318211', COMMERCIAL_PHONE_NUMBER_ID);
    expect(isLidStableKey(key)).toBe(true);
    expect(isLidStableKey(conversationStableKey(CUSTOMER, COMMERCIAL_PHONE_NUMBER_ID))).toBe(false);
  });

  it('does not treat a private LID or BSUID as a dialable phone', () => {
    expect(isWhatsappLidIdentity('lid:CO.2284278722318211')).toBe(true);
    expect(
      isWhatsappLidIdentity(`lid:CO.2284278722318211__${COMMERCIAL_PHONE_NUMBER_ID}`),
    ).toBe(true);
    expect(isWhatsappLidIdentity('CO.2284278722318211')).toBe(true);
    expect(isWhatsappLidIdentity(CUSTOMER)).toBe(false);
  });
});
