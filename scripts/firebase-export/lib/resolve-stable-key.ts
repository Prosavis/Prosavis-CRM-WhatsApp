import { resolveStableKeyFromMessage } from './normalize-phone.js';

/**
 * Deriva conversation_stable_key desde un documento whatsapp_message_log.
 * En Firestore no existe el campo conversation_stable_key; se infiere por teléfono/BSUID.
 */
export function resolveMessageStableKey(data: Record<string, unknown>): string | null {
  return resolveStableKeyFromMessage(data);
}
