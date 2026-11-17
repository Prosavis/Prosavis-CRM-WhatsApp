import { assertEquals } from 'jsr:@std/assert';
import {
  buildRecipientPayload,
  getBlocklistKey,
  graphSendTarget,
  resolveRecipient,
} from './whatsappIdentity.ts';

Deno.test('a typed phone keeps the BSUID window until Meta confirms the number', () => {
  assertEquals(
    graphSendTarget({ to: '573173006989', bsuid: 'CO.28741370675495691' }),
    'lid:CO.28741370675495691',
  );
  assertEquals(
    graphSendTarget({
      to: '573173006989',
      bsuid: 'CO.28741370675495691',
      phoneFromMeta: true,
    }),
    '573173006989',
  );
  assertEquals(graphSendTarget({ to: '573173006989' }), '573173006989');
  assertEquals(
    graphSendTarget({ to: '573173006989', bsuid: 'lid:CO.1' }),
    'lid:CO.1',
  );
});

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
