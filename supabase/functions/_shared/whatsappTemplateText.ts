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

export type ReminderPaymentKind = 'completo' | 'pendiente' | 'parcial';

export type ReminderPaymentInput = {
  totalAmount?: unknown;
  paymentStatus?: unknown;
  paidAmount?: unknown;
  pendingAmount?: unknown;
};

function moneyCop(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function remainingCop(input: ReminderPaymentInput): number {
  const stored = Number(input.pendingAmount);
  if (Number.isFinite(stored) && stored >= 0) return Math.round(stored);
  return Math.max(0, moneyCop(input.totalAmount) - moneyCop(input.paidAmount));
}

export function formatCurrencyCop(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(moneyCop(amount));
}

/** Parcial nunca es pendiente: abono abierto o PAGO_EN_PROCESO van a parcial. */
export function classifyReminderPayment(input: ReminderPaymentInput): ReminderPaymentKind {
  const status = String(input.paymentStatus ?? '').trim().toUpperCase();
  const paid = moneyCop(input.paidAmount);
  const remaining = remainingCop(input);

  if (status === 'PAGO_ACEPTADO') return 'completo';
  if (status === 'PAGO_EN_PROCESO' || (paid > 0 && remaining > 0)) {
    return remaining <= 0 ? 'completo' : 'parcial';
  }
  if (paid > 0 && remaining <= 0) return 'completo';
  return 'pendiente';
}

export function buildReminderPaymentText(input: ReminderPaymentInput): string {
  const total = formatCurrencyCop(moneyCop(input.totalAmount));
  const kind = classifyReminderPayment(input);
  switch (kind) {
    case 'completo':
      return `${total} - Pagado`;
    case 'pendiente':
      return `${total} - Pendiente`;
    case 'parcial':
      return `${total} - Parcial (abonado ${formatCurrencyCop(moneyCop(input.paidAmount))}, pendiente ${formatCurrencyCop(remainingCop(input))})`;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function buildReminderPaymentWarning(input: ReminderPaymentInput): string {
  const kind = classifyReminderPayment(input);
  switch (kind) {
    case 'completo':
      return '✅ Tu pago ya está confirmado. Gracias por confiar en Prosavis.';
    case 'pendiente':
      return '⚠️ Tu pago aún está pendiente. Para asegurar tu cita, te invitamos a realizar el pago lo antes posible.';
    case 'parcial':
      return `⚠️ Queda un saldo de ${formatCurrencyCop(remainingCop(input))}. Ya abonaste ${formatCurrencyCop(moneyCop(input.paidAmount))}.`;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
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
