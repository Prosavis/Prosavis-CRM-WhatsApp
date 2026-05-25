/**
 * Alineado con functions/src/whatsapp/whatsappIdentity.normalizePhone
 */
export function normalizeWhatsAppPanelPhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
  if (cleaned.startsWith('57') && cleaned.length === 12) return cleaned;
  if (cleaned.length === 10 && cleaned.startsWith('3')) return `57${cleaned}`;
  return cleaned;
}
