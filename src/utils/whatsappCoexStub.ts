/** Must stay in sync with supabase/functions/_shared/whatsappCoexWebhook.ts */
export const COMMERCIAL_ORPHAN_STATUS_STUB =
  'Enviado desde WhatsApp Business / Facebook';

export function isCommercialOrphanStatusStub(body?: string | null): boolean {
  return (body ?? '').trim() === COMMERCIAL_ORPHAN_STATUS_STUB;
}

/** Inbox list preview: never show the Meta status stub as if it were Francy's text. */
export function conversationPreviewText(body?: string | null): string {
  const text = (body ?? '').trim();
  if (!text) return 'Sin mensajes';
  if (isCommercialOrphanStatusStub(text)) return 'Mensaje desde la app';
  return text;
}

export function quotedMessagePreview(body?: string | null): string {
  const text = (body ?? '').trim();
  if (isCommercialOrphanStatusStub(text)) return 'Mensaje desde la app';
  return text;
}
