import { assertEquals, assertFalse } from 'jsr:@std/assert';
import {
  buildProfessionalReminderAddress,
  sanitizeWhatsAppTemplateParam,
  WHATSAPP_TEMPLATE_EMPTY,
  WHATSAPP_TEMPLATE_PARAM_MAX_LEN,
} from './whatsappTemplateText.ts';

const JULIAN_TEKA_ADDRESS =
  'Calle 15 No. 7A-85 Conjunto residencial TEKA Torre 4 Apto 501 \nDosquebradas Risaralda';

Deno.test('TEKA address of Julián becomes a single Meta-safe line', () => {
  const text = sanitizeWhatsAppTemplateParam(JULIAN_TEKA_ADDRESS);
  assertEquals(
    text,
    'Calle 15 No. 7A-85 Conjunto residencial TEKA Torre 4 Apto 501, Dosquebradas Risaralda',
  );
  assertFalse(text.includes('\n'));
  assertFalse(text.includes('\r'));
  assertFalse(text.includes('\t'));
});

Deno.test('empty or whitespace-only params fall back to em dash', () => {
  assertEquals(sanitizeWhatsAppTemplateParam(''), WHATSAPP_TEMPLATE_EMPTY);
  assertEquals(sanitizeWhatsAppTemplateParam('   \n\t  '), WHATSAPP_TEMPLATE_EMPTY);
  assertEquals(sanitizeWhatsAppTemplateParam(undefined), WHATSAPP_TEMPLATE_EMPTY);
});

Deno.test('four-plus spaces collapse so Meta does not reject the param', () => {
  assertEquals(sanitizeWhatsAppTemplateParam('Calle 9    Pereira'), 'Calle 9 Pereira');
});

Deno.test('professional mapsLink stays on one line', () => {
  const text = buildProfessionalReminderAddress(
    JULIAN_TEKA_ADDRESS,
    'https://maps.google.com/?q=teka',
  );
  assertFalse(text.includes('\n'));
  assertEquals(
    text,
    'Calle 15 No. 7A-85 Conjunto residencial TEKA Torre 4 Apto 501, Dosquebradas Risaralda · Google Maps: https://maps.google.com/?q=teka',
  );
});

Deno.test('professional address without mapsLink is just the sanitized street', () => {
  assertEquals(
    buildProfessionalReminderAddress(JULIAN_TEKA_ADDRESS),
    'Calle 15 No. 7A-85 Conjunto residencial TEKA Torre 4 Apto 501, Dosquebradas Risaralda',
  );
});

Deno.test('overlong params are truncated', () => {
  const text = sanitizeWhatsAppTemplateParam('x'.repeat(WHATSAPP_TEMPLATE_PARAM_MAX_LEN + 40));
  assertEquals(text.length, WHATSAPP_TEMPLATE_PARAM_MAX_LEN);
});
