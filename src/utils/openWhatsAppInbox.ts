import type { NavigateFunction } from 'react-router-dom';
import { ensureWhatsAppConversationFromLead } from '@/services/whatsappService';
import { WHATSAPP_CLOUD_PRODUCTION } from '@/constants/whatsappCloudAccounts';
import { whatsappInboxHref } from '@/utils/whatsappTabs';

export interface OpenWhatsAppInboxParams {
  navigate: NavigateFunction;
  phone?: string | null;
  conversationStableKey?: string | null;
  name?: string | null;
  phoneNumberId?: string;
}

/**
 * Asegura la conversación (si hay teléfono) y navega al inbox correcto:
 * Inbox Bot por defecto, Inbox Comercial si el hilo o phoneNumberId es comercial.
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

  params.navigate(whatsappInboxHref({
    conversationId: conversationKey,
    phone,
    phoneNumberId: params.phoneNumberId,
  }));
  return true;
}
