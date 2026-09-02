import {
  WHATSAPP_CLOUD_COMMERCIAL,
  WHATSAPP_CLOUD_PRODUCTION,
} from '@/constants/whatsappCloudAccounts';

export const WHATSAPP_BOT_PHONE_DISPLAY =
  WHATSAPP_CLOUD_PRODUCTION.phoneDisplay || '+57 312 253 1271';

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

export function formatDirectoryContactCount(total: number): string {
  return total.toLocaleString('es-CO');
}

export function directoryNavMeta(total: number | null) {
  const title = 'Directorio';
  const count = total == null ? '' : formatDirectoryContactCount(total);
  return {
    title,
    count,
    ariaLabel: count ? `${title} ${count} contactos` : title,
  };
}
