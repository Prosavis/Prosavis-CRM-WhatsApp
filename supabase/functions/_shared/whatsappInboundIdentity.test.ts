import { assertEquals } from 'jsr:@std/assert';
import {
  formatWebhookError,
  isLidCustomerKey,
  lidCustomerKey,
  resolveInboundCustomer,
} from './whatsappInboundIdentity.ts';

Deno.test('phone inbound uses from even when user_id is present', () => {
  const identity = resolveInboundCustomer(
    {
      id: 'wamid.augusto',
      from: '573005653159',
      from_user_id: 'CO.1708329556950231',
      text: { body: 'Hola buena tarde' },
    },
    [{
      wa_id: '573005653159',
      user_id: 'CO.1708329556950231',
      profile: { name: 'Augusto León' },
    }],
  );
  assertEquals(identity?.kind, 'phone');
  assertEquals(identity?.customerKey, '573005653159');
  assertEquals(identity?.profileName, 'Augusto León');
  assertEquals(identity?.userId, 'CO.1708329556950231');
});

Deno.test('LID inbound without from uses from_user_id', () => {
  const identity = resolveInboundCustomer(
    {
      id: 'wamid.fernanda',
      from_user_id: 'CO.2284278722318211',
      text: { body: '3' },
    },
    [{
      profile: { name: 'Fernanda', username: 'fernanda.lucuara.33' },
      user_id: 'CO.2284278722318211',
    }],
  );
  assertEquals(identity?.kind, 'lid');
  assertEquals(identity?.customerKey, 'lid:CO.2284278722318211');
  assertEquals(identity?.username, 'fernanda.lucuara.33');
  assertEquals(identity?.profileName, 'Fernanda');
  assertEquals(isLidCustomerKey(identity?.customerKey), true);
  assertEquals(lidCustomerKey('CO.2284278722318211'), 'lid:CO.2284278722318211');
});

Deno.test('inbound without from or user id is rejected', () => {
  assertEquals(resolveInboundCustomer({ id: 'wamid.x', text: { body: 'hola' } }, []), null);
});

Deno.test('PostgREST errors are serialized instead of [object Object]', () => {
  assertEquals(
    formatWebhookError({
      code: '23502',
      message: 'null value in column "full_name"',
      details: 'Failing row contains (...)',
    }),
    '23502 — null value in column "full_name" — Failing row contains (...)',
  );
  assertEquals(formatWebhookError(new Error('Mensaje entrante sin from o id.')), 'Mensaje entrante sin from o id.');
});
