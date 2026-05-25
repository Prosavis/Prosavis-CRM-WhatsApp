import type { WhatsAppConversation } from '@/services/whatsappService';

const MS_PER_24H = 24 * 60 * 60 * 1000;

/** Conversación no archivada con `lastMessageAt` en la ventana móvil de 24 h (desde `nowMs`). */
export function isWhatsAppConversationLastActiveWithin24h(
  c: WhatsAppConversation,
  nowMs: number = Date.now(),
): boolean {
  if (c.isArchived) return false;
  const t = c.lastMessageAt?.getTime();
  if (t == null) return false;
  return nowMs - t <= MS_PER_24H;
}

export interface WhatsAppTabCounts {
  last24h: number;
  all: number;
  unread: number;
  tagged: number;
  archived: number;
}

export interface WhatsAppInboxMetrics {
  /** Todas las conversaciones de la línea (incluye archivadas). */
  totalConversations: number;
  tabCounts: WhatsAppTabCounts;
  /** Conversaciones que incluyen cada tagId (universo completo, incluye archivadas). */
  tagCountsById: Record<string, number>;
}

export function computeTabCounts(conversations: WhatsAppConversation[]): WhatsAppTabCounts {
  let last24h = 0;
  let all = 0;
  let unread = 0;
  let tagged = 0;
  let archived = 0;
  const nowMs = Date.now();

  for (const c of conversations) {
    const isArchived = !!c.isArchived;
    if (isArchived) {
      archived += 1;
      continue;
    }

    all += 1;

    if (isWhatsAppConversationLastActiveWithin24h(c, nowMs)) last24h += 1;

    const hasUnread = c.unreadCount > 0 || !!c.crmForceUnread;
    if (hasUnread) unread += 1;

    const hasTags = Array.isArray(c.tagIds) && c.tagIds.length > 0;
    if (hasTags) tagged += 1;
  }

  return { last24h, all, unread, tagged, archived };
}

export function computeTagCounts(conversations: WhatsAppConversation[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of conversations) {
    const ids = c.tagIds;
    if (!ids?.length) continue;
    for (const id of ids) {
      if (!id) continue;
      out[id] = (out[id] ?? 0) + 1;
    }
  }
  return out;
}

export function computeWhatsAppInboxMetrics(conversations: WhatsAppConversation[]): WhatsAppInboxMetrics {
  return {
    totalConversations: conversations.length,
    tabCounts: computeTabCounts(conversations),
    tagCountsById: computeTagCounts(conversations),
  };
}
