import {
  WHATSAPP_CLOUD_COMMERCIAL,
  WHATSAPP_CLOUD_PRODUCTION,
} from '@/constants/whatsappCloudAccounts';

export const WHATSAPP_BOT_PHONE_DISPLAY =
  WHATSAPP_CLOUD_PRODUCTION.phoneDisplay || '+57 312 2531271';

export const WHATSAPP_COMMERCIAL_PHONE_DISPLAY =
  WHATSAPP_CLOUD_COMMERCIAL.phoneDisplay || '+57 311 212 1108';

export type WhatsAppInboxLineNav = 'bot' | 'commercial';

export function inboxLineNavMeta(line: WhatsAppInboxLineNav) {
  if (line === 'commercial') {
    const title = WHATSAPP_CLOUD_COMMERCIAL.label || 'Inbox Comercial';
    const phone = WHATSAPP_COMMERCIAL_PHONE_DISPLAY;
    return { title, phone, ariaLabel: `${title} ${phone}` };
  }

  const title = 'Inbox Bot';
  const phone = WHATSAPP_BOT_PHONE_DISPLAY;
  return { title, phone, ariaLabel: `${title} ${phone}` };
}
