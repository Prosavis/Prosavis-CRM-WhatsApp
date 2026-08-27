/** Espejo frontend de supabase/functions/_shared/whatsappLines.ts — mantener IDs alineados. */

export const BOT_PHONE_NUMBER_ID = '1035566289641219';
export const COMMERCIAL_PHONE_NUMBER_ID =
  import.meta.env.VITE_WHATSAPP_COMMERCIAL_PHONE_NUMBER_ID?.trim() || '1043086062223440';
export const BOT_WABA_ID =
  import.meta.env.VITE_WHATSAPP_WABA_ID?.trim() || '1644307903653451';
export const COMMERCIAL_WABA_ID =
  import.meta.env.VITE_WHATSAPP_COMMERCIAL_WABA_ID?.trim() || '1680332820009096';
export const COMMERCIAL_STABLE_KEY_SEP = '__';

export type WhatsAppLineId = 'bot' | 'commercial';
export type WhatsAppLineFilter = WhatsAppLineId | 'all';

export function isCommercialPhoneNumberId(
  phoneNumberId: string | null | undefined,
): boolean {
  const id = (phoneNumberId ?? '').trim();
  return Boolean(id) && id === COMMERCIAL_PHONE_NUMBER_ID;
}

export function resolveWhatsAppLine(
  phoneNumberId?: string | null,
): WhatsAppLineId {
  return isCommercialPhoneNumberId(phoneNumberId) ? 'commercial' : 'bot';
}

export function conversationStableKey(
  customerPhone: string,
  phoneNumberId?: string | null,
): string {
  const phone = customerPhone.trim();
  if (!phone) return phone;
  if (isCommercialPhoneNumberId(phoneNumberId)) {
    return `${phone}${COMMERCIAL_STABLE_KEY_SEP}${COMMERCIAL_PHONE_NUMBER_ID}`;
  }
  return phone;
}

export function isCommercialStableKey(stableKey: string): boolean {
  return stableKey.includes(COMMERCIAL_STABLE_KEY_SEP);
}

export function customerPhoneFromStableKey(stableKey: string): string {
  const idx = stableKey.indexOf(COMMERCIAL_STABLE_KEY_SEP);
  if (idx === -1) return stableKey.trim();
  return stableKey.slice(0, idx).trim();
}

export function siblingConversationStableKey(stableKey: string): string | null {
  const key = stableKey.trim();
  if (!key) return null;
  if (isCommercialStableKey(key)) {
    return customerPhoneFromStableKey(key);
  }
  return conversationStableKey(key, COMMERCIAL_PHONE_NUMBER_ID);
}

export function wabaIdForLine(line: WhatsAppLineId): string {
  return line === 'commercial' ? COMMERCIAL_WABA_ID : BOT_WABA_ID;
}

export function phoneNumberIdForFilter(filter: WhatsAppLineFilter): string | undefined {
  if (filter === 'all') return undefined;
  if (filter === 'commercial') return COMMERCIAL_PHONE_NUMBER_ID;
  return import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID?.trim() || BOT_PHONE_NUMBER_ID;
}
