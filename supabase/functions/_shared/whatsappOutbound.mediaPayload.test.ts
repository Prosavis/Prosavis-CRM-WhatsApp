import { assertEquals, assertThrows } from 'jsr:@std/assert';
import {
  buildOutboundMediaPayload,
  defaultMimeForMediaType,
} from './whatsappOutboundMedia.ts';

Deno.test('buildOutboundMediaPayload prefers mediaId over link (Meta weblink failures)', () => {
  const payload = buildOutboundMediaPayload({
    mediaType: 'document',
    mediaId: 'meta-media-123',
    mediaUrl: 'https://example.supabase.co/storage/v1/object/sign/whatsapp-media/x.pdf?token=abc',
    filename: 'Prosavis_Limpieza_B2C.pdf',
    caption: 'Cotización',
  });

  assertEquals(payload, {
    id: 'meta-media-123',
    caption: 'Cotización',
    filename: 'Prosavis_Limpieza_B2C.pdf',
  });
});

Deno.test('buildOutboundMediaPayload falls back to link when no mediaId', () => {
  const payload = buildOutboundMediaPayload({
    mediaType: 'image',
    mediaUrl: 'https://cdn.example/photo.png',
    caption: 'Hola',
  });

  assertEquals(payload, {
    link: 'https://cdn.example/photo.png',
    caption: 'Hola',
  });
});

Deno.test('an audio voice note asks Meta for the WhatsApp voice bubble', () => {
  assertEquals(buildOutboundMediaPayload({
    mediaType: 'audio',
    mediaId: 'meta-audio-1',
    voice: true,
  }), {
    id: 'meta-audio-1',
    voice: true,
  });
});

Deno.test('buildOutboundMediaPayload rejects empty media references', () => {
  assertThrows(
    () => buildOutboundMediaPayload({ mediaType: 'audio' }),
    Error,
    'Se requiere mediaId o mediaUrl',
  );
});

Deno.test('defaultMimeForMediaType covers Meta media kinds', () => {
  assertEquals(defaultMimeForMediaType('document'), 'application/octet-stream');
  assertEquals(defaultMimeForMediaType('sticker'), 'image/webp');
  assertEquals(defaultMimeForMediaType('image'), 'image/jpeg');
});
