import { assertEquals } from 'jsr:@std/assert';
import { BOT_PHONE_NUMBER_ID, COMMERCIAL_PHONE_NUMBER_ID } from './whatsappLines.ts';
import {
  buildRutaInboundEvent,
  buildRutaInboundRequest,
  forwardRutaInbound,
  type RutaInboundEvent,
} from './rutaInbound.ts';

const RECEIVED_AT = '2026-11-06T13:00:00.000Z';
const ENV = { url: 'https://prosavis.com/api/r/_inbound', apiKey: 'inbound-key' };

function event(message: Record<string, unknown>, phoneNumberId: string | null = BOT_PHONE_NUMBER_ID) {
  return buildRutaInboundEvent({
    message: { from: '573001234567', id: 'wamid.in', ...message },
    phoneNumberId,
    receivedAt: RECEIVED_AT,
  });
}

const BUTTON_EVENT: RutaInboundEvent = {
  from: '573001234567',
  waMessageId: 'wamid.in',
  receivedAt: RECEIVED_AT,
  type: 'button',
  text: 'Ver cómo llegar',
};

function jsonFetch(body: unknown, status = 200, calls: Array<{ url: string; init?: RequestInit }> = []): typeof fetch {
  return (input, init) => {
    calls.push({ url: String(input), init });
    return Promise.resolve(new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }));
  };
}

Deno.test('template quick reply on 312 is a Ruta button event', () => {
  assertEquals(
    event({ type: 'button', button: { text: 'Ver cómo llegar', payload: 'Ver cómo llegar' } }),
    BUTTON_EVENT,
  );
  assertEquals(event({ type: 'button', button: { text: 'Mandar mi ubicación' } })?.text, 'Mandar mi ubicación');
  assertEquals(event({ type: 'button', button: { payload: 'enviar ubicación' } })?.text, 'Enviar ubicación');
});

Deno.test('decomposed accents still match the quick reply', () => {
  assertEquals(event({ type: 'button', button: { text: 'Ver co\u0301mo llegar' } })?.text, 'Ver cómo llegar');
});

Deno.test('interactive button_reply with a Ruta title is a button event', () => {
  assertEquals(
    event({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'x', title: 'Enviar ubicación' } } })?.type,
    'button',
  );
  assertEquals(
    event({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'x', title: 'Enviar ubicación' } } }),
    null,
  );
});

Deno.test('other buttons and plain text keep going to the bot', () => {
  assertEquals(event({ type: 'button', button: { text: 'Confirmar', payload: 'Confirmar' } }), null);
  assertEquals(
    event({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'ctwa_domestica', title: 'Hogar' } } }),
    null,
  );
  assertEquals(event({ type: 'text', text: { body: 'Ver cómo llegar' } }), null);
  assertEquals(event({ type: 'image', image: { id: 'm1' } }), null);
});

Deno.test('location on 312 is forwarded with lat/lng', () => {
  assertEquals(event({ type: 'location', location: { latitude: 4.65, longitude: -74.05, name: 'Casa' } }), {
    from: '573001234567',
    waMessageId: 'wamid.in',
    receivedAt: RECEIVED_AT,
    type: 'location',
    location: { lat: 4.65, lng: -74.05 },
  });
  assertEquals(event({ type: 'location', location: { latitude: 200, longitude: -74.05 } }), null);
  assertEquals(event({ type: 'location', location: {} }), null);
});

Deno.test('only line 312: the 311 coexistence line and unknown lines are never forwarded', () => {
  const location = { type: 'location', location: { latitude: 4.65, longitude: -74.05 } };
  assertEquals(event(location, COMMERCIAL_PHONE_NUMBER_ID), null);
  assertEquals(event(location, null), null);
  assertEquals(event({ type: 'button', button: { text: 'Ver cómo llegar' } }, COMMERCIAL_PHONE_NUMBER_ID), null);
});

Deno.test('senders without a phone (BSUID) or without message id are skipped', () => {
  const button = { type: 'button', button: { text: 'Ver cómo llegar' } };
  assertEquals(event({ ...button, from: 'CO.1068129212242368' }), null);
  assertEquals(event({ ...button, from: '' }), null);
  assertEquals(event({ ...button, id: '' }), null);
});

Deno.test('request carries x-api-key and the contract JSON', () => {
  const request = buildRutaInboundRequest(BUTTON_EVENT, ENV);
  assertEquals(request?.url, ENV.url);
  assertEquals(request?.init.method, 'POST');
  assertEquals(request?.init.headers, { 'Content-Type': 'application/json', 'x-api-key': 'inbound-key' });
  assertEquals(JSON.parse(String(request?.init.body)), BUTTON_EVENT);
});

Deno.test('missing env: no request, no fetch, the bot keeps the message', async () => {
  assertEquals(buildRutaInboundRequest(BUTTON_EVENT, { url: '', apiKey: 'k' }), null);
  assertEquals(buildRutaInboundRequest(BUTTON_EVENT, { url: ENV.url }), null);
  const calls: Array<{ url: string }> = [];
  assertEquals(await forwardRutaInbound(BUTTON_EVENT, { fetchImpl: jsonFetch({ handled: true }, 200, calls) }), false);
  assertEquals(calls.length, 0);
});

Deno.test('handled: true skips the bot; anything else does not', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  assertEquals(await forwardRutaInbound(BUTTON_EVENT, { ...ENV, fetchImpl: jsonFetch({ handled: true }, 200, calls) }), true);
  assertEquals(calls[0].url, ENV.url);
  assertEquals(await forwardRutaInbound(BUTTON_EVENT, { ...ENV, fetchImpl: jsonFetch({ handled: false }) }), false);
  assertEquals(await forwardRutaInbound(BUTTON_EVENT, { ...ENV, fetchImpl: jsonFetch({ handled: 'true' }) }), false);
  assertEquals(await forwardRutaInbound(BUTTON_EVENT, { ...ENV, fetchImpl: jsonFetch({ handled: true }, 500) }), false);
});

Deno.test('network error or non-JSON body fails open', async () => {
  const throwing: typeof fetch = () => Promise.reject(new Error('ECONNRESET'));
  assertEquals(await forwardRutaInbound(BUTTON_EVENT, { ...ENV, fetchImpl: throwing }), false);
  const html: typeof fetch = () => Promise.resolve(new Response('<html>', { status: 200 }));
  assertEquals(await forwardRutaInbound(BUTTON_EVENT, { ...ENV, fetchImpl: html }), false);
});

Deno.test('timeout aborts the call and fails open', async () => {
  const hanging: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
  const started = Date.now();
  assertEquals(await forwardRutaInbound(BUTTON_EVENT, { ...ENV, fetchImpl: hanging, timeoutMs: 20 }), false);
  assertEquals(Date.now() - started < 1000, true);
});
