import { assertEquals } from 'jsr:@std/assert';
import {
  buildRecipientPayload,
  getBlocklistKey,
  resolveRecipient,
} from './whatsappIdentity.ts';

Deno.test('internal LID customer key resolves to a Meta BSUID recipient', () => {
  assertEquals(
    resolveRecipient('lid:CO.1068129212242368'),
    { bsuid: 'CO.1068129212242368' },
  );
});

Deno.test('Meta payload uses recipient without to for an internal LID key', () => {
  const recipient = resolveRecipient('lid:CO.1068129212242368');

  assertEquals(
    buildRecipientPayload(recipient),
    { recipient: 'CO.1068129212242368' },
  );
  assertEquals(
    getBlocklistKey('lid:CO.1068129212242368'),
    'CO.1068129212242368',
  );
});
