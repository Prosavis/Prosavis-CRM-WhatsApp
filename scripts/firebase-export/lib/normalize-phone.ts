const BSUID_REGEX = /^[A-Z]{2}\.[A-Za-z0-9.]+$/;

export function isBsuid(value: string): boolean {
  return BSUID_REGEX.test(value);
}

/** Paridad con prosavis-firebase/functions/src/whatsapp/whatsappIdentity.ts */
export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
  if (cleaned.startsWith('57') && cleaned.length === 12) return cleaned;
  if (cleaned.length === 10 && cleaned.startsWith('3')) return `57${cleaned}`;
  return cleaned;
}

export function resolveStableKeyFromMessage(data: Record<string, unknown>): string | null {
  const phone = data.recipientPhone;
  if (typeof phone === 'string' && phone.trim()) {
    const trimmed = phone.trim();
    return isBsuid(trimmed) ? trimmed : normalizePhone(trimmed);
  }

  const bsuid = data.recipientBsuid;
  if (typeof bsuid === 'string' && bsuid.trim()) return bsuid.trim();

  return null;
}
