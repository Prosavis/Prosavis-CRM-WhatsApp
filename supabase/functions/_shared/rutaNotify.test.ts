import { assertEquals } from 'jsr:@std/assert';
import { BOT_PHONE_NUMBER_ID } from './whatsappLines.ts';
import { sendToMeta } from './whatsappOutbound.ts';
import {
  apiKeyMatches,
  authorizeRutaNotify,
  buildRutaNotifyPayload,
  parseRutaNotifyRequest,
  rutaNotifyAuthStatus,
  type RutaNotifyRequest,
} from './rutaNotify.ts';

function parsedOrThrow(body: unknown): RutaNotifyRequest {
  const parsed = parseRutaNotifyRequest(body);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

function parseError(body: unknown): string | null {
  const parsed = parseRutaNotifyRequest(body);
  return parsed.ok ? null : parsed.error;
}

async function metaRequestFor(request: RutaNotifyRequest): Promise<Record<string, unknown>> {
  const plan = buildRutaNotifyPayload(request);
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Promise.resolve(new Response(
      JSON.stringify({ messages: [{ id: 'wamid.ruta' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
  };
  try {
    const result = await sendToMeta({
      ...plan.send,
      to: plan.to,
      phoneNumberId: BOT_PHONE_NUMBER_ID,
      accessToken: 'test-token',
    });
    assertEquals(result.status, 'sent');
    assertEquals(result.waMessageId, 'wamid.ruta');
  } finally {
    globalThis.fetch = originalFetch;
  }
  return requestBody;
}

Deno.test('auth: missing RUTA_NOTIFY_API_KEY is a 500, not an open door', async () => {
  const auth = await authorizeRutaNotify('anything', '');
  assertEquals(auth, 'missing_env');
  assertEquals(rutaNotifyAuthStatus(auth), 500);
  assertEquals(await authorizeRutaNotify(null, undefined), 'missing_env');
});

Deno.test('auth: wrong, empty or absent x-api-key is a 401', async () => {
  assertEquals(await authorizeRutaNotify('wrong-key', 'secret-key'), 'unauthorized');
  assertEquals(await authorizeRutaNotify('secret-key-but-longer', 'secret-key'), 'unauthorized');
  assertEquals(await authorizeRutaNotify('', 'secret-key'), 'unauthorized');
  assertEquals(await authorizeRutaNotify(null, 'secret-key'), 'unauthorized');
  assertEquals(rutaNotifyAuthStatus('unauthorized'), 401);
});

Deno.test('auth: the right key passes', async () => {
  assertEquals(await authorizeRutaNotify(' secret-key ', 'secret-key'), 'ok');
  assertEquals(await apiKeyMatches('secret-key', 'secret-key'), true);
  assertEquals(rutaNotifyAuthStatus('ok'), 200);
});

Deno.test('validation: rejects non-objects, unknown kinds and unknown fields', () => {
  assertEquals(parseError(null), 'El cuerpo debe ser un objeto JSON.');
  assertEquals(parseError([]), 'El cuerpo debe ser un objeto JSON.');
  assertEquals(parseError({ kind: 'audio', to: '573001234567' }) !== null, true);
  assertEquals(
    parseError({ kind: 'location_request', to: '573001234567', text: 'Toque', extra: 1 }),
    'Campos no permitidos para location_request: extra.',
  );
});

Deno.test('validation: to must be a dialable phone, not a BSUID', () => {
  assertEquals(parseError({ kind: 'location_request', to: 'CO.1068129212242368', text: 'x' }) !== null, true);
  assertEquals(parseError({ kind: 'location_request', to: '12345', text: 'x' }) !== null, true);
  assertEquals(parseError({ kind: 'location_request', to: 573001234567, text: 'x' }) !== null, true);
  assertEquals(parsedOrThrow({ kind: 'location_request', to: '+57 300 123 4567', text: 'x' }).to, '573001234567');
  assertEquals(parsedOrThrow({ kind: 'location_request', to: '3001234567', text: 'x' }).to, '573001234567');
});

Deno.test('validation: template name, param count and url suffix follow the approved templates', () => {
  const base = { kind: 'template', to: '573001234567' };
  assertEquals(parseError({ ...base, templateName: 'recordatorio_cita_24h', bodyParams: ['Luz'] }) !== null, true);
  assertEquals(
    parseError({ ...base, templateName: 'ruta_hoy', bodyParams: ['Luz'], urlSuffix: 'abc' }),
    'ruta_hoy lleva 2 parámetro(s) en bodyParams.',
  );
  assertEquals(
    parseError({ ...base, templateName: 'ruta_hoy', bodyParams: ['Luz', '8:00 am'] }) !== null,
    true,
  );
  assertEquals(
    parseError({ ...base, templateName: 'ruta_hoy', bodyParams: ['Luz', '8:00 am'], urlSuffix: 'a/b?c=d' }) !== null,
    true,
  );
  assertEquals(
    parseError({ ...base, templateName: 'ruta_manana', bodyParams: ['Luz', '8:00 am'], urlSuffix: 'x' }),
    'ruta_manana no tiene botón URL; quite urlSuffix.',
  );
  assertEquals(
    parseError({ ...base, templateName: 'ruta_sin_senal', bodyParams: ['Luz\nPérez'] }),
    'bodyParams[0] no puede tener saltos de línea, tabs ni más de 4 espacios seguidos.',
  );
  assertEquals(parseError({ ...base, templateName: 'ruta_sin_senal', bodyParams: ['  '] }) !== null, true);
  assertEquals(parseError({ ...base, templateName: 'ruta_sin_senal', bodyParams: 'Luz' }) !== null, true);
});

Deno.test('validation: location coordinates, https image links and location_request text', () => {
  const to = '573001234567';
  assertEquals(parseError({ kind: 'location', to, lat: 91, lng: -74 }), 'lat debe ser un número entre -90 y 90.');
  assertEquals(parseError({ kind: 'location', to, lat: 4.6, lng: '-74' }), 'lng debe ser un número entre -180 y 180.');
  assertEquals(parseError({ kind: 'location', to, lat: Number.NaN, lng: -74 }) !== null, true);
  assertEquals(parseError({ kind: 'image', to, link: 'http://cdn.example/a.jpg' }), 'link debe ser una URL https.');
  assertEquals(parseError({ kind: 'image', to, link: 'javascript:alert(1)' }), 'link debe ser una URL https.');
  assertEquals(parseError({ kind: 'image', to, link: 'https://cdn.example/a.jpg', caption: '' }) !== null, true);
  assertEquals(parseError({ kind: 'location_request', to }), 'text es obligatorio.');
});

Deno.test('payload: ruta_hoy sends body params plus the EMPEZAR url suffix, inbox shows the body only', async () => {
  const request = parsedOrThrow({
    kind: 'template',
    to: '573001234567',
    templateName: 'ruta_hoy',
    bodyParams: ['Luz', '8:00 am'],
    urlSuffix: '7f3a9c2e5b1d4a8f',
  });
  const plan = buildRutaNotifyPayload(request);
  assertEquals(plan.displayBody, 'Hola Luz, hoy a las 8:00 am tiene servicio. Cuando salga de su casa, toque EMPEZAR.');
  assertEquals(plan.displayBody.includes('7f3a9c2e5b1d4a8f'), false);
  assertEquals(plan.requiresSessionWindow, false);
  assertEquals(plan.logFields, { template_name: 'ruta_hoy' });

  assertEquals(await metaRequestFor(request), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '573001234567',
    type: 'template',
    template: {
      name: 'ruta_hoy',
      language: { code: 'es_CO' },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: 'Luz' }, { type: 'text', text: '8:00 am' }],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: '7f3a9c2e5b1d4a8f' }],
        },
      ],
    },
  });
});

Deno.test('payload: quick-reply templates carry only body params', async () => {
  const request = parsedOrThrow({
    kind: 'template',
    to: '573001234567',
    templateName: 'pedir_ubicacion_cliente',
    bodyParams: ['Ana'],
  });
  const body = await metaRequestFor(request);
  assertEquals(body.template, {
    name: 'pedir_ubicacion_cliente',
    language: { code: 'es_CO' },
    components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }],
  });
});

Deno.test('payload: location is a service message with the pin', async () => {
  const request = parsedOrThrow({ kind: 'location', to: '573001234567', lat: 4.65, lng: -74.05, name: 'Casa de Ana' });
  const plan = buildRutaNotifyPayload(request);
  assertEquals(plan.requiresSessionWindow, true);
  assertEquals(plan.displayBody, 'Casa de Ana');
  assertEquals(plan.logFields, { location: { latitude: 4.65, longitude: -74.05, name: 'Casa de Ana' } });
  assertEquals(await metaRequestFor(request), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '573001234567',
    type: 'location',
    location: { latitude: 4.65, longitude: -74.05, name: 'Casa de Ana' },
  });
});

Deno.test('payload: image by https link with caption', async () => {
  const request = parsedOrThrow({
    kind: 'image',
    to: '573001234567',
    link: 'https://storage.googleapis.com/prosavis/door.jpg?sig=1',
    caption: 'Punto de bajada',
  });
  const plan = buildRutaNotifyPayload(request);
  assertEquals(plan.requiresSessionWindow, true);
  assertEquals(await metaRequestFor(request), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '573001234567',
    type: 'image',
    image: { link: 'https://storage.googleapis.com/prosavis/door.jpg?sig=1', caption: 'Punto de bajada' },
  });
});

Deno.test('payload: location_request uses the native send_location button', async () => {
  const request = parsedOrThrow({
    kind: 'location_request',
    to: '573001234567',
    text: 'Toque el botón para mandar la ubicación.',
  });
  assertEquals(buildRutaNotifyPayload(request).displayBody, 'Toque el botón para mandar la ubicación.');
  assertEquals(await metaRequestFor(request), {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '573001234567',
    type: 'interactive',
    interactive: {
      type: 'location_request_message',
      body: { text: 'Toque el botón para mandar la ubicación.' },
      action: { name: 'send_location' },
    },
  });
});
