export const INBOX_LIST_WIDTH_MIN = 200;
export const INBOX_LIST_WIDTH_MAX = 640;
export const INBOX_LIST_WIDTH_DEFAULT = 320;
export const INBOX_LIST_WIDTH_KEY = 'whatsapp-inbox-list-width';

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

export function readStoredInboxListWidth(): number {
  try {
    return parseInboxListWidth(localStorage.getItem(INBOX_LIST_WIDTH_KEY));
  } catch {
    return INBOX_LIST_WIDTH_DEFAULT;
  }
}
