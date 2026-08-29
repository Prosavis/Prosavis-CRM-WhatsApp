/** Must stay in sync with supabase/functions/_shared/whatsappCoexWebhook.ts */
export const COMMERCIAL_ORPHAN_STATUS_STUB =
  'Enviado desde WhatsApp Business / Facebook';

export function isCommercialOrphanStatusStub(body?: string | null): boolean {
  return (body ?? '').trim() === COMMERCIAL_ORPHAN_STATUS_STUB;
}

export const DELETED_MESSAGE_PREVIEW = 'Mensaje eliminado';

export function isDeletedOrUnsupportedPreview(body?: string | null): boolean {
  const text = (body ?? '').trim();
  return text === '[unsupported]' || text === DELETED_MESSAGE_PREVIEW;
}

/** Inbox list preview: never show the Meta status stub as if it were Francy's text. */
export function conversationPreviewText(body?: string | null): string {
  const text = (body ?? '').trim();
  if (!text) return 'Sin mensajes';
  if (isCommercialOrphanStatusStub(text)) return 'Mensaje desde la app';
  if (isDeletedOrUnsupportedPreview(text)) return DELETED_MESSAGE_PREVIEW;
  return text;
}

export function quotedMessagePreview(body?: string | null): string {
  const text = (body ?? '').trim();
  if (isCommercialOrphanStatusStub(text)) return 'Mensaje desde la app';
  if (isDeletedOrUnsupportedPreview(text)) return DELETED_MESSAGE_PREVIEW;
  return text;
}
