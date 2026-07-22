/**
 * Deep link para WhatsApp Desktop / app nativa (Windows, macOS, móvil).
 * Requiere dígitos internacionales sin «+» (ej. 573001234567).
 */
export function whatsappDesktopUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return `whatsapp://send?phone=${digits}`;
}
