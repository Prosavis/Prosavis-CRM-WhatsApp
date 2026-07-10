import type { NavigateFunction } from 'react-router-dom';
import { ensureWhatsAppConversationFromLead } from '@/services/whatsappService';
import { WHATSAPP_CLOUD_PRODUCTION } from '@/constants/whatsappCloudAccounts';

export interface OpenWhatsAppInboxParams {
  navigate: NavigateFunction;
  phone?: string | null;
  conversationStableKey?: string | null;
  name?: string | null;
  phoneNumberId?: string;
}

/**
 * Asegura la conversación (si hay teléfono) y navega al Inbox con
 * `conversation` + `focusPhone`, sin tab secundaria.
 */
export async function openWhatsAppInbox(params: OpenWhatsAppInboxParams): Promise<boolean> {
  const phone = params.phone?.trim() || null;
  let conversationKey = params.conversationStableKey?.trim() || null;

  if (!conversationKey && !phone) return false;

  if (phone) {
    try {
      const result = await ensureWhatsAppConversationFromLead({
        phone,
        name: params.name ?? undefined,
        phoneNumberId: params.phoneNumberId ?? WHATSAPP_CLOUD_PRODUCTION.phoneNumberId,
      });
      if (!conversationKey && result.conversationId) {
        conversationKey = result.conversationId;
      }
    } catch (err) {
      console.error('Error ensuring conversation for inbox open:', err);
    }
  }

  if (!conversationKey && phone) {
    conversationKey = phone.replace(/\D/g, '');
  }
  if (!conversationKey) return false;

  const search = new URLSearchParams();
  search.set('conversation', conversationKey);
  if (phone) search.set('focusPhone', phone);
  params.navigate(`/whatsapp?${search.toString()}`);
  return true;
}
