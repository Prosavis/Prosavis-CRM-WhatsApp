import { assertEquals } from 'jsr:@std/assert';
import { BOT_PHONE_NUMBER_ID, COMMERCIAL_PHONE_NUMBER_ID } from './whatsappLines.ts';
import { buildFrancyNotice } from './francyAssistantGate.ts';

function notice(overrides: Partial<Parameters<typeof buildFrancyNotice>[0]> = {}) {
  return buildFrancyNotice({
    field: 'messages',
    from: '573112121108',
    phoneNumberId: BOT_PHONE_NUMBER_ID,
    waMessageId: 'wamid.1',
    messageType: 'text',
    text: 'ya lo hice',
    caption: null,
    mediaId: null,
    mimeType: null,
    filename: null,
    ...overrides,
  });
}

Deno.test('una respuesta del 311 al 312 arma el aviso', () => {
  const built = notice();
  assertEquals(built?.waMessageId, 'wamid.1');
  assertEquals(built?.from, '573112121108');
});

Deno.test('clientas, el webhook del 311 y los ecos no avisan', () => {
  assertEquals(notice({ from: '573009998877' }), null);
  assertEquals(notice({ from: '573122531271' }), null);
  assertEquals(notice({ phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID }), null);
  assertEquals(notice({ field: 'smb_message_echoes' }), null);
});
