/**
 * Parámetros de plantilla Meta (Cloud API).
 * #132018 si un {{n}} trae salto de línea, tab o más de 4 espacios seguidos.
 */

export const WHATSAPP_TEMPLATE_EMPTY = '—';
export const WHATSAPP_TEMPLATE_PARAM_MAX_LEN = 600;

export function sanitizeWhatsAppTemplateParam(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  const flattened = raw
    .replace(/[\u00A0\u202F\u2007\u2009]/g, ' ')
    .replace(/[\r\n\t]+/g, ', ')
    .replace(/[ ]*,[ ]*/g, ', ')
    .replace(/ {4,}/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
  if (!flattened) return WHATSAPP_TEMPLATE_EMPTY;
  if (flattened.length <= WHATSAPP_TEMPLATE_PARAM_MAX_LEN) return flattened;
  return flattened.slice(0, WHATSAPP_TEMPLATE_PARAM_MAX_LEN).trim();
}

/** Dirección del recordatorio profesional: Maps en la misma línea (nunca \\n). */
export function buildProfessionalReminderAddress(
  address?: string | null,
  mapsLink?: string | null,
): string {
  const base = sanitizeWhatsAppTemplateParam(address ?? '');
  const link = typeof mapsLink === 'string' ? mapsLink.trim() : '';
  if (!link) return base;
  return sanitizeWhatsAppTemplateParam(`${base} · Google Maps: ${link}`);
}
