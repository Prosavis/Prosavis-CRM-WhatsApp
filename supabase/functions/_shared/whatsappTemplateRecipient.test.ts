import { assertEquals, assertThrows } from 'jsr:@std/assert';
import {
  assertTemplateRecipientSupported,
  resolveTemplateRecipientKey,
} from './whatsappTemplateRecipient.ts';

Deno.test('template recipient keeps an internal LID key for BSUID delivery', () => {
  assertEquals(
    resolveTemplateRecipientKey('lid:CO.1068129212242368'),
    'lid:CO.1068129212242368',
  );
});

Deno.test('authentication templates require a phone recipient', () => {
  assertThrows(
    () => assertTemplateRecipientSupported(
      'lid:CO.1068129212242368',
      'AUTHENTICATION',
    ),
    Error,
    '131062',
  );
  assertTemplateRecipientSupported('lid:CO.1068129212242368', 'UTILITY');
});
