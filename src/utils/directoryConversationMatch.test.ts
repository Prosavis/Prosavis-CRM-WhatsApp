import { describe, expect, it } from 'vitest';
import { COMMERCIAL_PHONE_NUMBER_ID } from '@/utils/whatsappLines';
import {
  conversationDirectoryColumn,
  directoryConversationLink,
  directoryEntryMatchesConversation,
  isDialableConversationPhone,
} from './directoryConversationMatch';

const COMMERCIAL_LID = `lid:CO.1056069074089331__${COMMERCIAL_PHONE_NUMBER_ID}`;
const BOT_LID = 'lid:CO.1056069074089331';

describe('conversationDirectoryColumn', () => {
  it('uses the commercial conversation column for 311 threads', () => {
    expect(conversationDirectoryColumn(COMMERCIAL_LID)).toBe(
      'whatsapp_commercial_conversation_id',
    );
  });

  it('uses the bot conversation column for 312 threads', () => {
    expect(conversationDirectoryColumn(BOT_LID)).toBe('whatsapp_conversation_id');
    expect(conversationDirectoryColumn('573150729571')).toBe(
      'whatsapp_conversation_id',
    );
  });
});

describe('directoryConversationLink', () => {
  it('links commercial LID threads to the commercial column', () => {
    expect(directoryConversationLink(COMMERCIAL_LID)).toEqual({
      whatsAppCommercialConversationId: COMMERCIAL_LID,
    });
  });

  it('links bot threads to whatsapp_conversation_id', () => {
    expect(directoryConversationLink('573150729571')).toEqual({
      whatsAppConversationId: '573150729571',
    });
  });
});

describe('isDialableConversationPhone', () => {
  it('accepts Colombian mobiles and rejects LID or empty values', () => {
    expect(isDialableConversationPhone('+573150729571')).toBe(true);
    expect(isDialableConversationPhone('3150729571')).toBe(true);
    expect(isDialableConversationPhone(COMMERCIAL_LID)).toBe(false);
    expect(isDialableConversationPhone('CO.1056069074089331')).toBe(false);
    expect(isDialableConversationPhone('')).toBe(false);
    expect(isDialableConversationPhone(null)).toBe(false);
  });
});

describe('directoryEntryMatchesConversation', () => {
  it('matches a LID commercial row by conversation id even without a phone', () => {
    expect(
      directoryEntryMatchesConversation(
        {
          phone: null,
          whatsAppCommercialConversationId: COMMERCIAL_LID,
        },
        { id: COMMERCIAL_LID, phone: null, contactPhone: null },
      ),
    ).toBe(true);
  });

  it('matches a bot LID row by whatsapp_conversation_id', () => {
    expect(
      directoryEntryMatchesConversation(
        { whatsAppConversationId: BOT_LID },
        { id: BOT_LID },
      ),
    ).toBe(true);
  });

  it('matches a regular chat by phone_key', () => {
    expect(
      directoryEntryMatchesConversation(
        { phone: '+573150729571' },
        { id: '573150729571', phone: '3150729571' },
      ),
    ).toBe(true);
  });

  it('rejects a directory row that belongs to another conversation', () => {
    expect(
      directoryEntryMatchesConversation(
        {
          phone: '+573001112233',
          whatsAppCommercialConversationId: 'lid:CO.other__1043086062223440',
        },
        { id: COMMERCIAL_LID, phone: null, contactPhone: null },
      ),
    ).toBe(false);
  });

  it('does not treat a BSUID as a matching phone', () => {
    expect(
      directoryEntryMatchesConversation(
        { phone: 'CO.1056069074089331' },
        { id: COMMERCIAL_LID, phone: 'CO.1056069074089331' },
      ),
    ).toBe(false);
  });
});
