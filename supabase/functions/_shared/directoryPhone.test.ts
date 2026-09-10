import { assertEquals } from 'jsr:@std/assert';
import { COMMERCIAL_PHONE_NUMBER_ID } from './whatsappLines.ts';
import { directoryPhoneFromWhatsAppIdentity } from './directoryPhone.ts';

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
