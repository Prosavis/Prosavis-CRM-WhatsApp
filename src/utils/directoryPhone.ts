/**
 * Normalización E.164 para crm_directory (Colombia +57 por defecto).
 * Debe alinearse con prosavis-firebase/functions/src/utils/phone.ts
 */

export function normalizeDirectoryPhoneE164(
  phone: string | null | undefined
): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 10 && digits.startsWith('3')) {
    return `+57${digits}`;
  }
  if (digits.length === 12 && digits.startsWith('57')) {
    return `+${digits}`;
  }
  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

/** Últimos 10 dígitos (móvil CO) para deduplicación. */
export function directoryPhoneKey(
  phone: string | null | undefined
): string | null {
  const e164 = normalizeDirectoryPhoneE164(phone);
  if (!e164) return null;
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** True si el valor parece un número de teléfono (≥10 dígitos), no un UID. */
export function looksLikePhoneValue(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10;
}

/**
 * Resuelve teléfono E.164 para guardar perfil/contacto.
 * Orden: payload → fallback (conversación/entry) → teléfono existente en entry.
 */
export function resolveContactPhoneForSave(options: {
  payloadPhone?: string | null;
  fallbackPhone?: string | null;
  existingEntryPhone?: string | null;
}): string {
  const candidates = [
    options.payloadPhone,
    options.fallbackPhone,
    options.existingEntryPhone,
  ];
  for (const raw of candidates) {
    const normalized = normalizeDirectoryPhoneE164(raw);
    if (normalized) return normalized;
  }
  throw new Error(
    'Teléfono inválido. Usa formato internacional, ej. +573001234567',
  );
}

export function directoryPhoneLookupVariants(
  phone: string | null | undefined
): string[] {
  if (!phone || typeof phone !== 'string') return [];
  const e164 = normalizeDirectoryPhoneE164(phone);
  const digits = phone.replace(/\D/g, '');
  const variants = new Set<string>();
  if (e164) variants.add(e164);
  if (digits) {
    variants.add(digits);
    variants.add(`+${digits}`);
    if (digits.length === 10 && digits.startsWith('3')) {
      variants.add(`57${digits}`);
      variants.add(`+57${digits}`);
    }
  }
  return [...variants];
}
