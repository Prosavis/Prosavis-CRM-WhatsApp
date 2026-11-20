export const RECIPIENT_BLOCKED_MESSAGE =
  'Este número está bloqueado por Decline. Quita esa etiqueta para poder escribir.';

const GENERIC_SEND_FAILURE = 'No se pudo enviar el mensaje';

/** Texto que ve quien escribe, a partir del error de `send-whatsapp-chat-message`. */
export function outboundSendErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message.trim() : '';
  if (raw === 'recipient_blocked') return RECIPIENT_BLOCKED_MESSAGE;
  return raw || GENERIC_SEND_FAILURE;
}
