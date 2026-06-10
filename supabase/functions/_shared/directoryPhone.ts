/**
 * Normalización E.164 para crm_directory (Edge Functions / Deno).
 * Alineado con prosavis-firebase/functions/src/utils/phone.ts
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

export function directoryPhoneKey(
  phone: string | null | undefined
): string | null {
  const e164 = normalizeDirectoryPhoneE164(phone);
  if (!e164) return null;
  const digits = e164.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
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
