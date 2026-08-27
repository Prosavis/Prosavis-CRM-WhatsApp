/**
 * Líneas WhatsApp Cloud de Prosavis.
 * Bot (citas) y comercial (Francy / Coex) comparten crm_directory por phone_key.
 * El hilo bot conserva stable_key = teléfono del cliente.
 */

export const BOT_PHONE_NUMBER_ID = '1035566289641219';
export const COMMERCIAL_PHONE_NUMBER_ID = '1043086062223440';
export const BOT_WABA_ID = '1644307903653451';
export const COMMERCIAL_WABA_ID = '1680332820009096';
export const COMMERCIAL_STABLE_KEY_SEP = '__';

export type WhatsAppLineId = 'bot' | 'commercial';

export function envString(name: string): string {
  try {
    return (Deno.env.get(name) ?? '').trim();
  } catch {
    return '';
  }
}

export function botPhoneNumberId(): string {
  return envString('WHATSAPP_PHONE_NUMBER_ID') || BOT_PHONE_NUMBER_ID;
}

export function commercialPhoneNumberId(): string {
  return envString('WHATSAPP_COMMERCIAL_PHONE_NUMBER_ID') || COMMERCIAL_PHONE_NUMBER_ID;
}

export function botWabaId(): string {
  return envString('WHATSAPP_WABA_ID') || envString('WABA_MCP_WABA_ID') || BOT_WABA_ID;
}

export function commercialWabaId(): string {
  return envString('WHATSAPP_COMMERCIAL_WABA_ID') || COMMERCIAL_WABA_ID;
}

export function isCommercialPhoneNumberId(
  phoneNumberId: string | null | undefined,
): boolean {
  const id = (phoneNumberId ?? '').trim();
  if (!id) return false;
  return id === commercialPhoneNumberId();
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
    return `${phone}${COMMERCIAL_STABLE_KEY_SEP}${commercialPhoneNumberId()}`;
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
  return conversationStableKey(key, commercialPhoneNumberId());
}

export function assertBotOnlyAutomation(phoneNumberId?: string | null): void {
  if (isCommercialPhoneNumberId(phoneNumberId)) {
    throw new Error('Esta automatización solo sale por la línea bot (312).');
  }
}
