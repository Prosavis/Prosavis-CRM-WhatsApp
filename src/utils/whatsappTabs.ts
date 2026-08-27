import {
  isCommercialPhoneNumberId,
  isCommercialStableKey,
  type WhatsAppLineFilter,
} from './whatsappLines';

export const WHATSAPP_TAB_KEYS = [
  'inbox',
  'commercial',
  'metrics',
  'leads',
  'discounts',
  'settings',
  'monitoreo',
  'automations',
] as const;

export type WhatsAppTabKey = (typeof WHATSAPP_TAB_KEYS)[number];

export const WHATSAPP_INBOX_PATH = '/whatsapp';

const TAB_QUERY_VALUES = new Set<WhatsAppTabKey>(WHATSAPP_TAB_KEYS);

export function isWhatsAppTabKey(value: string | null | undefined): value is WhatsAppTabKey {
  return Boolean(value && TAB_QUERY_VALUES.has(value as WhatsAppTabKey));
}

export function resolveWhatsAppTabKey(search: URLSearchParams): WhatsAppTabKey {
  const tab = search.get('tab');
  if (isWhatsAppTabKey(tab) && tab !== 'inbox') return tab;
  if (!tab && search.get('line') === 'commercial') return 'commercial';
  return 'inbox';
}

export function resolveWhatsAppLineFilter(search: URLSearchParams): WhatsAppLineFilter {
  const tab = resolveWhatsAppTabKey(search);
  if (tab === 'commercial') return 'commercial';
  if (tab === 'inbox' && search.get('line') === 'all') return 'all';
  return 'bot';
}

export function applyWhatsAppTab(
  search: URLSearchParams,
  tab: WhatsAppTabKey,
): URLSearchParams {
  const next = new URLSearchParams(search);
  if (tab === 'inbox') next.delete('tab');
  else next.set('tab', tab);
  if (tab !== 'inbox') next.delete('line');
  else if (next.get('line') === 'commercial') next.delete('line');
  return next;
}

export function normalizeWhatsAppSearchParams(search: URLSearchParams): {
  next: URLSearchParams;
  changed: boolean;
} {
  const next = new URLSearchParams(search);
  let changed = false;
  if (next.get('line') === 'commercial') {
    next.set('tab', 'commercial');
    next.delete('line');
    changed = true;
  }
  if (next.get('tab') === 'inbox') {
    next.delete('tab');
    changed = true;
  }
  if (next.get('tab') === 'commercial' && next.has('line')) {
    next.delete('line');
    changed = true;
  }
  return { next, changed };
}

export function isCommercialConversationRef(params: {
  conversationId?: string | null;
  phoneNumberId?: string | null;
}): boolean {
  return (
    isCommercialPhoneNumberId(params.phoneNumberId) ||
    Boolean(params.conversationId && isCommercialStableKey(params.conversationId))
  );
}

export function buildWhatsAppInboxSearch(params: {
  conversationId?: string | null;
  phone?: string | null;
  phoneNumberId?: string | null;
  tab?: WhatsAppTabKey;
}): URLSearchParams {
  const commercial = isCommercialConversationRef(params);
  const tab = params.tab ?? (commercial ? 'commercial' : 'inbox');
  const search = applyWhatsAppTab(new URLSearchParams(), tab);
  if (params.conversationId) search.set('conversation', params.conversationId);
  if (params.phone) search.set('focusPhone', params.phone);
  return search;
}

export function whatsappInboxHref(params: {
  conversationId?: string | null;
  phone?: string | null;
  phoneNumberId?: string | null;
  tab?: WhatsAppTabKey;
}): string {
  const search = buildWhatsAppInboxSearch(params);
  const qs = search.toString();
  return qs ? `${WHATSAPP_INBOX_PATH}?${qs}` : WHATSAPP_INBOX_PATH;
}

export function applyWhatsAppFocusChat(
  search: URLSearchParams,
  detail: {
    phone?: string | null;
    conversationId?: string | null;
    phoneNumberId?: string | null;
  },
): URLSearchParams {
  const commercial = isCommercialConversationRef(detail);
  const next = applyWhatsAppTab(search, commercial ? 'commercial' : 'inbox');
  if (detail.phone) next.set('focusPhone', detail.phone);
  else next.delete('focusPhone');
  if (detail.conversationId) next.set('conversation', detail.conversationId);
  else next.delete('conversation');
  return next;
}

export function conversationBelongsToLineFilter(
  conversation: { id: string; phoneNumberId?: string | null },
  filter: WhatsAppLineFilter,
): boolean {
  if (filter === 'all') return true;
  const commercial = isCommercialConversationRef({
    conversationId: conversation.id,
    phoneNumberId: conversation.phoneNumberId,
  });
  return filter === 'commercial' ? commercial : !commercial;
}

export function preferConversationForFilter<
  T extends { id: string; phoneNumberId?: string | null },
>(matches: T[], filter: WhatsAppLineFilter): T | undefined {
  if (matches.length === 0) return undefined;
  if (filter === 'commercial') {
    return matches.find((conversation) =>
      conversationBelongsToLineFilter(conversation, 'commercial'),
    ) ?? matches[0];
  }
  return (
    matches.find((conversation) => conversationBelongsToLineFilter(conversation, 'bot')) ??
    matches[0]
  );
}

export function whatsappTabIndex(tab: WhatsAppTabKey): number {
  return WHATSAPP_TAB_KEYS.indexOf(tab);
}

export function whatsappTabFromIndex(index: number): WhatsAppTabKey {
  return WHATSAPP_TAB_KEYS[index] ?? 'inbox';
}
