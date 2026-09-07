import { normalizePhone, resolveRecipient } from './whatsappIdentity.ts';

export const BSUID_AUTH_TEMPLATE_UNSUPPORTED_CODE = 131062;

export function resolveTemplateRecipientKey(input: string): string {
  const value = input.trim();
  const recipient = resolveRecipient(value);
  if (!recipient.phone) return value;

  const normalized = normalizePhone(recipient.phone);
  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new Error(
      'Número de teléfono inválido (use formato internacional, ej. 573001234567).',
    );
  }
  return normalized;
}

export function assertTemplateRecipientSupported(
  recipientKey: string,
  templateCategory?: string,
): void {
  const recipient = resolveRecipient(recipientKey);
  if (
    !recipient.phone
    && templateCategory?.trim().toUpperCase() === 'AUTHENTICATION'
  ) {
    throw new Error(
      `${BSUID_AUTH_TEMPLATE_UNSUPPORTED_CODE}: las plantillas de autenticación requieren un número de teléfono.`,
    );
  }
}
