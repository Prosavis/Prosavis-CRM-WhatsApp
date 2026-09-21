import { assertEquals, assertFalse } from 'jsr:@std/assert';
import {
  buildProfessionalReminderAddress,
  buildReminderPaymentText,
  buildReminderPaymentWarning,
  classifyReminderPayment,
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

Deno.test('pago pendiente sin abono is pendiente, not parcial', () => {
  const input = { totalAmount: 148000, paymentStatus: 'PAGO_PENDIENTE', paidAmount: 0 };
  assertEquals(classifyReminderPayment(input), 'pendiente');
  assertEquals(buildReminderPaymentText(input).includes('Pendiente'), true);
  assertEquals(buildReminderPaymentText(input).includes('Parcial'), false);
  assertEquals(buildReminderPaymentWarning(input).includes('aún está pendiente'), true);
});

Deno.test('pago aceptado is completo / pagado', () => {
  const input = { totalAmount: 148000, paymentStatus: 'PAGO_ACEPTADO', paidAmount: 148000 };
  assertEquals(classifyReminderPayment(input), 'completo');
  assertEquals(buildReminderPaymentText(input).includes('Pagado'), true);
  assertEquals(buildReminderPaymentWarning(input).includes('pago ya está confirmado'), true);
});

Deno.test('pago en proceso never reads as pendiente and shows abono vs saldo', () => {
  const input = {
    totalAmount: 148000,
    paymentStatus: 'PAGO_EN_PROCESO',
    paidAmount: 63379,
    pendingAmount: 84621,
  };
  assertEquals(classifyReminderPayment(input), 'parcial');
  const text = buildReminderPaymentText(input);
  const warning = buildReminderPaymentWarning(input);
  assertEquals(text.includes('Parcial'), true);
  assertEquals(text.includes('abonado'), true);
  assertEquals(text.includes(' - Pendiente'), false);
  assertEquals(text.includes(' - Pagado'), false);
  assertEquals(warning.includes('aún está pendiente'), false);
  assertEquals(warning.includes('pago ya está confirmado'), false);
  assertEquals(warning.includes('84621') || warning.includes('84.621') || warning.includes('84,621'), true);
  assertEquals(warning.includes('63379') || warning.includes('63.379') || warning.includes('63,379'), true);
});

Deno.test('abono with PAGO_PENDIENTE status is still parcial, never pendiente', () => {
  const input = { totalAmount: 148000, paymentStatus: 'PAGO_PENDIENTE', paidAmount: 50000 };
  assertEquals(classifyReminderPayment(input), 'parcial');
  assertEquals(buildReminderPaymentWarning(input).includes('aún está pendiente'), false);
});
