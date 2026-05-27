const BSUID_REGEX = /^[A-Z]{2}\.[A-Za-z0-9.]+$/;
const PARENT_BSUID_REGEX = /^[A-Z]{2}\.ENT\.[A-Za-z0-9]+$/;

export interface WhatsAppRecipient {
  phone?: string;
  bsuid?: string;
  parentBsuid?: string;
}

export function isBsuid(value: string): boolean {
  return BSUID_REGEX.test(value);
}

export function isParentBsuid(value: string): boolean {
  return PARENT_BSUID_REGEX.test(value);
}

export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9+]/g, '');
  if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
  if (cleaned.startsWith('57') && cleaned.length === 12) return cleaned;
  if (cleaned.length === 10 && cleaned.startsWith('3')) return `57${cleaned}`;
  return cleaned;
}

export function resolveRecipient(value: string): WhatsAppRecipient {
  if (isParentBsuid(value)) return { parentBsuid: value };
  if (isBsuid(value)) return { bsuid: value };
  return { phone: value };
}

export function buildRecipientPayload(
  recipient: WhatsAppRecipient,
  options?: { requirePhone?: boolean },
): Record<string, string> {
  const payload: Record<string, string> = {};
  if (recipient.phone) payload.to = normalizePhone(recipient.phone);
  if (recipient.bsuid && !options?.requirePhone) payload.recipient = recipient.bsuid;
  else if (recipient.parentBsuid && !options?.requirePhone) payload.recipient = recipient.parentBsuid;
  if (!payload.to && !payload.recipient) {
    throw new Error('Se requiere al menos un teléfono o BSUID para enviar mensaje');
  }
  return payload;
}

export function getBlocklistKey(to: string): string {
  const recipient = resolveRecipient(to);
  if (recipient.phone) return normalizePhone(recipient.phone);
  return recipient.bsuid || recipient.parentBsuid || to;
}

export function getStableKeyFromRecipient(to: string): string {
  return getBlocklistKey(to);
}
