import { directoryPhoneKey, directoryPhonesMatch } from '@/utils/directoryPhone';
import {
  isCommercialStableKey,
  isWhatsappLidIdentity,
} from '@/utils/whatsappLines';

export type ConversationDirectoryColumn =
  | 'whatsapp_conversation_id'
  | 'whatsapp_commercial_conversation_id';

export type DirectoryConversationIdentity = {
  phone?: string | null;
  whatsAppConversationId?: string | null;
  whatsAppCommercialConversationId?: string | null;
};

export type ConversationIdentity = {
  id?: string | null;
  phone?: string | null;
  contactPhone?: string | null;
};

export function conversationStableKeyOf(conversation: ConversationIdentity): string {
  return (conversation.id ?? '').trim();
}

export function conversationDirectoryColumn(
  stableKey: string,
): ConversationDirectoryColumn {
  return isCommercialStableKey(stableKey)
    ? 'whatsapp_commercial_conversation_id'
    : 'whatsapp_conversation_id';
}

/** True when the value is a real E.164 mobile, not a LID/BSUID. */
export function isDialableConversationPhone(
  value: string | null | undefined,
): value is string {
  if (!value?.trim()) return false;
  if (isWhatsappLidIdentity(value)) return false;
  return Boolean(directoryPhoneKey(value));
}

export function directoryConversationLink(stableKey: string): {
  whatsAppConversationId?: string;
  whatsAppCommercialConversationId?: string;
} {
  if (isCommercialStableKey(stableKey)) {
    return { whatsAppCommercialConversationId: stableKey };
  }
  return { whatsAppConversationId: stableKey };
}

export function directoryEntryMatchesConversation(
  entry: DirectoryConversationIdentity,
  conversation: ConversationIdentity,
): boolean {
  const stableKey = conversationStableKeyOf(conversation);
  if (stableKey) {
    if ((entry.whatsAppConversationId ?? '').trim() === stableKey) return true;
    if ((entry.whatsAppCommercialConversationId ?? '').trim() === stableKey) {
      return true;
    }
  }

  const convPhone = conversation.contactPhone || conversation.phone;
  return (
    isDialableConversationPhone(convPhone) &&
    directoryPhonesMatch(entry.phone, convPhone)
  );
}
