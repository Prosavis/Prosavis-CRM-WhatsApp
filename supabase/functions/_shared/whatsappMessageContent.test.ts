import { assertEquals } from 'jsr:@std/assert';
import {
  CLOUD_API_REVOKED_LABEL,
  cloudApiUnsupportedDisposition,
  getMessageContent,
  humanUnsupportedLabel,
} from './whatsappMessageContent.ts';

Deno.test('Cloud API revoke stays visible as Mensaje eliminado, not [unsupported]', () => {
  const message = {
    type: 'unsupported',
    errors: [{ code: 131051, title: 'Message type unknown' }],
    unsupported: { type: 'revoke', raw_type: 'revoke' },
  };
  const content = getMessageContent(message);
  assertEquals(content.messageBody, CLOUD_API_REVOKED_LABEL);
  assertEquals(cloudApiUnsupportedDisposition(message), {
    kind: 'revoke',
    originalMessageId: null,
  });
});

Deno.test('Cloud API revoke keeps original id when Meta sends it', () => {
  const message = {
    type: 'unsupported',
    unsupported: { type: 'revoke', original_message_id: 'wamid.ORIG' },
  };
  assertEquals(cloudApiUnsupportedDisposition(message), {
    kind: 'revoke',
    originalMessageId: 'wamid.ORIG',
  });
});

Deno.test('poll unsupported gets a human label, not [unsupported]', () => {
  const message = {
    type: 'unsupported',
    unsupported: { type: 'poll' },
  };
  assertEquals(getMessageContent(message).messageBody, humanUnsupportedLabel('poll'));
  assertEquals(cloudApiUnsupportedDisposition(message), { kind: 'labeled' });
  assertEquals(humanUnsupportedLabel('poll').includes('Encuesta'), true);
});

Deno.test('plain text and media stay unchanged', () => {
  assertEquals(getMessageContent({ type: 'text', text: { body: 'hola' } }).messageBody, 'hola');
  assertEquals(
    getMessageContent({ type: 'image', image: { id: 'mid', caption: 'foto' } }).mediaType,
    'image',
  );
});
