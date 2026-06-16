export const DESKTOP_NOTIFICATIONS_ENABLED_KEY = 'prosavis-crm-desktop-notifications-enabled';
export const DESKTOP_NOTIFICATIONS_ONBOARDING_DISMISSED_KEY =
  'prosavis-crm-desktop-notifications-onboarding-dismissed';

export const WHATSAPP_FOCUS_CHAT_EVENT = 'whatsapp-focus-chat';

export interface WhatsAppFocusChatDetail {
  phone: string;
  conversationId: string;
}

export interface InboundMessageNotificationParams {
  title: string;
  body: string;
  conversationId: string;
  phone: string;
  icon?: string;
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function areDesktopNotificationsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const saved = localStorage.getItem(DESKTOP_NOTIFICATIONS_ENABLED_KEY);
  return saved === null ? true : saved === 'true';
}

export function setDesktopNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(DESKTOP_NOTIFICATIONS_ENABLED_KEY, String(enabled));
}

export function isDesktopNotificationsOnboardingDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(DESKTOP_NOTIFICATIONS_ONBOARDING_DISMISSED_KEY) === 'true';
}

export function dismissDesktopNotificationsOnboarding(): void {
  localStorage.setItem(DESKTOP_NOTIFICATIONS_ONBOARDING_DISMISSED_KEY, 'true');
}

export function dispatchWhatsAppFocusChat(detail: WhatsAppFocusChatDetail): void {
  window.dispatchEvent(
    new CustomEvent<WhatsAppFocusChatDetail>(WHATSAPP_FOCUS_CHAT_EVENT, { detail }),
  );
}

export function canShowDesktopNotifications(): boolean {
  return (
    isNotificationSupported() &&
    areDesktopNotificationsEnabled() &&
    getNotificationPermission() === 'granted'
  );
}

export function showInboundMessageNotification(params: InboundMessageNotificationParams): void {
  if (!canShowDesktopNotifications()) return;

  const icon =
    params.icon ?? `${import.meta.env.BASE_URL}assets/icons/iconoProsavisClean.png`;

  const notification = new Notification(params.title, {
    body: params.body,
    tag: params.conversationId,
    icon,
    requireInteraction: false,
    silent: false,
    ...({ renotify: true } as NotificationOptions),
  });

  notification.onclick = () => {
    window.focus();
    dispatchWhatsAppFocusChat({
      phone: params.phone,
      conversationId: params.conversationId,
    });
    notification.close();
  };
}
