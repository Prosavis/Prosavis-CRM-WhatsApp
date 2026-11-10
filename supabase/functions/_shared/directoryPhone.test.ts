import { assertEquals } from 'jsr:@std/assert';
import { COMMERCIAL_PHONE_NUMBER_ID } from './whatsappLines.ts';
import {
  directoryPhoneFromWhatsAppIdentity,
  leadConversationIdentity,
} from './directoryPhone.ts';

Deno.test('directory phone ignores commercial LID/BSUID identities', () => {
  assertEquals(
    directoryPhoneFromWhatsAppIdentity(null, 'lid:CO.2284278722318211'),
    null,
  );
  assertEquals(
    directoryPhoneFromWhatsAppIdentity(
      `lid:CO.2284278722318211__${COMMERCIAL_PHONE_NUMBER_ID}`,
      null,
    ),
    null,
  );
  assertEquals(directoryPhoneFromWhatsAppIdentity('CO.2284278722318211', null), null);
  assertEquals(directoryPhoneFromWhatsAppIdentity('3001234567', null), '+573001234567');
});

Deno.test('lead conversation on the commercial line uses E.164 plus the line id', () => {
  assertEquals(leadConversationIdentity('321 5370343', COMMERCIAL_PHONE_NUMBER_ID), {
    phoneDigits: '573215370343',
    stableKey: `573215370343__${COMMERCIAL_PHONE_NUMBER_ID}`,
  });
  assertEquals(leadConversationIdentity('+573001234567', '1035566289641219'), {
    phoneDigits: '573001234567',
    stableKey: '573001234567',
  });
  assertEquals(leadConversationIdentity('123', COMMERCIAL_PHONE_NUMBER_ID), null);
});
