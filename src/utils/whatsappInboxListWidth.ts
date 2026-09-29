export const INBOX_LIST_WIDTH_MIN = 200;
export const INBOX_LIST_WIDTH_MAX = 640;
export const INBOX_LIST_WIDTH_DEFAULT = 320;
export const INBOX_LIST_WIDTH_KEY = 'whatsapp-inbox-list-width';

/** Viewport de referencia para anchos guardados en píxeles (antes del layout fluido). */
const INBOX_LIST_RATIO_REFERENCE = 1440;
export const INBOX_LIST_RATIO_MIN = 0.12;
export const INBOX_LIST_RATIO_MAX = 0.4;
export const INBOX_LIST_RATIO_DEFAULT = INBOX_LIST_WIDTH_DEFAULT / INBOX_LIST_RATIO_REFERENCE;

export function clampInboxListWidth(width: number): number {
  if (!Number.isFinite(width)) return INBOX_LIST_WIDTH_DEFAULT;
  return Math.min(INBOX_LIST_WIDTH_MAX, Math.max(INBOX_LIST_WIDTH_MIN, Math.round(width)));
}

export function parseInboxListWidth(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return INBOX_LIST_WIDTH_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return INBOX_LIST_WIDTH_DEFAULT;
  return clampInboxListWidth(n);
}

export function clampInboxListRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return INBOX_LIST_RATIO_DEFAULT;
  return Math.min(INBOX_LIST_RATIO_MAX, Math.max(INBOX_LIST_RATIO_MIN, ratio));
}

/** Un valor > 1 es un ancho en px de la versión anterior. */
export function parseInboxListRatio(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === '') return INBOX_LIST_RATIO_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n)) return INBOX_LIST_RATIO_DEFAULT;
  if (n > 1) return clampInboxListRatio(clampInboxListWidth(n) / INBOX_LIST_RATIO_REFERENCE);
  return clampInboxListRatio(n);
}

export function inboxListWidthForViewport(ratio: number, viewportWidth: number): number {
  const viewport = Number.isFinite(viewportWidth) && viewportWidth > 0
    ? viewportWidth
    : INBOX_LIST_RATIO_REFERENCE;
  const width = clampInboxListRatio(ratio) * viewport;
  const max = Math.max(INBOX_LIST_WIDTH_MIN, viewport * INBOX_LIST_RATIO_MAX);
  return Math.round(Math.min(max, Math.max(INBOX_LIST_WIDTH_MIN, width)));
}

export function readStoredInboxListRatio(): number {
  try {
    return parseInboxListRatio(localStorage.getItem(INBOX_LIST_WIDTH_KEY));
  } catch {
    return INBOX_LIST_RATIO_DEFAULT;
  }
}
