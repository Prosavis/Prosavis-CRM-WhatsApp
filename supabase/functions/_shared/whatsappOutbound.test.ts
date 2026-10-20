import { assertEquals } from 'jsr:@std/assert';
import { COMMERCIAL_PHONE_NUMBER_ID } from './whatsappLines.ts';
import {
  outboundConversationKey,
  outboundRecipientLogIdentity,
  sendToMeta,
} from './whatsappOutbound.ts';

Deno.test('outbound LID keeps the existing commercial conversation stable key', () => {
  assertEquals(
    outboundConversationKey(
      `lid:CO.1068129212242368__${COMMERCIAL_PHONE_NUMBER_ID}`,
      COMMERCIAL_PHONE_NUMBER_ID,
    ),
    `lid:CO.1068129212242368__${COMMERCIAL_PHONE_NUMBER_ID}`,
  );
});

Deno.test('Meta text request targets an LID through recipient without a fake phone', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | null = null;
  globalThis.fetch = (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Promise.resolve(new Response(
      JSON.stringify({ messages: [{ id: 'wamid.bsuid' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
  };

  try {
    const result = await sendToMeta({
      to: 'lid:CO.1068129212242368',
      phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID,
      accessToken: 'test-token',
      messageBody: 'Hola',
    });

    assertEquals(result.status, 'sent');
    assertEquals(requestBody, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      recipient: 'CO.1068129212242368',
      type: 'text',
      text: {
        preview_url: false,
        body: 'Hola',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test('cobro template without the CRM log does not call Meta', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = () => {
    called = true;
    return Promise.resolve(new Response('{}', { status: 200 }));
  };
  try {
    await sendToMeta({
      to: '573001234567',
      phoneNumberId: '1035566289641219',
      accessToken: 'test-token',
      templateName: 'cobro_transferencia',
      cobroNow: new Date('2026-10-16T10:00:00-05:00'),
    });
    throw new Error('debía rechazar');
  } catch (error) {
    assertEquals(
      error instanceof Error ? error.message : String(error),
      'Cobro bloqueado: falta el registro del CRM para validar la frecuencia.',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
  assertEquals(called, false);
});

Deno.test('outbound LID logs BSUID without pretending it is a phone number', () => {
  assertEquals(
    outboundRecipientLogIdentity('lid:CO.1068129212242368'),
    {
      recipientPhone: null,
      recipientBsuid: 'CO.1068129212242368',
    },
  );
});
