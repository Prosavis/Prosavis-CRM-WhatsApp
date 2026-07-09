import type { WhatsAppConversation, WhatsAppTag } from '@/services/whatsappService';
import {
  type InboxCategoryId,
  type InboxTagCategoryId,
  INBOX_CATEGORY_TAG_ALIASES,
  INBOX_TAG_CATEGORY_IDS,
  isInboxTagCategoryId,
  normalizeInboxTagName,
} from '@/constants/inboxCategories';

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
  archived: number;
  agendados: number;
  fueraCobertura: number;
  trabajo: number;
}

export interface WhatsAppInboxMetrics {
  /** Todas las conversaciones de la línea (incluye archivadas). */
  totalConversations: number;
  tabCounts: WhatsAppTabCounts;
  /** Conversaciones activas (no archivadas) que incluyen cada tagId. */
  tagCountsById: Record<string, number>;
  /** Conversaciones archivadas que incluyen cada tagId. */
  archivedTagCountsById: Record<string, number>;
  /** IDs de tags del catálogo que alimentan cada categoría de negocio. */
  categoryTagIds: Record<InboxTagCategoryId, string[]>;
}

export type TagLike = Pick<WhatsAppTag, 'id' | 'name'>;

/** Resuelve IDs de tags del catálogo que coinciden con los aliases de una categoría. */
export function resolveCategoryTagIds(
  category: InboxTagCategoryId,
  tags: TagLike[],
): string[] {
  const aliases = new Set(
    INBOX_CATEGORY_TAG_ALIASES[category].map((a) => normalizeInboxTagName(a)),
  );
  return tags
    .filter((t) => aliases.has(normalizeInboxTagName(t.name)))
    .map((t) => t.id);
}

export type CategoryTagIdOverrides = Partial<Record<InboxTagCategoryId, string[]>>;

/**
 * Resuelve IDs por categoría.
 * Si hay override (p. ej. Fuera de cobertura desde Supabase), usa esos IDs
 * filtrados al catálogo activo; si el override está vacío, cae a aliases.
 */
export function resolveAllCategoryTagIds(
  tags: TagLike[],
  overrides?: CategoryTagIdOverrides,
): Record<InboxTagCategoryId, string[]> {
  const knownIds = new Set(tags.map((t) => t.id));
  const out = {} as Record<InboxTagCategoryId, string[]>;
  for (const id of INBOX_TAG_CATEGORY_IDS) {
    const override = overrides?.[id];
    if (override && override.length > 0) {
      out[id] = override.filter((tagId) => knownIds.has(tagId));
      if (out[id].length > 0) continue;
    }
    out[id] = resolveCategoryTagIds(id, tags);
  }
  return out;
}

/** Todos los tag IDs usados por categorías fijas (para excluirlos del filtro secundario). */
export function collectCategoryOwnedTagIds(
  categoryTagIds: Record<InboxTagCategoryId, string[]>,
): Set<string> {
  const set = new Set<string>();
  for (const id of INBOX_TAG_CATEGORY_IDS) {
    for (const tagId of categoryTagIds[id]) set.add(tagId);
  }
  return set;
}

function conversationHasAnyTag(c: WhatsAppConversation, tagIds: string[]): boolean {
  if (!tagIds.length || !c.tagIds?.length) return false;
  return tagIds.some((tid) => c.tagIds!.includes(tid));
}

export function conversationMatchesSelectedTags(
  c: WhatsAppConversation,
  selectedTagIds: string[],
): boolean {
  if (selectedTagIds.length === 0) return true;
  return selectedTagIds.every((tid) => c.tagIds?.includes(tid));
}

/**
 * Aplica el filtro de categoría fija del sidebar.
 * No aplica búsqueda ni tags secundarios.
 */
export function conversationMatchesInboxCategory(
  c: WhatsAppConversation,
  category: InboxCategoryId,
  categoryTagIds: Record<InboxTagCategoryId, string[]>,
  nowMs: number = Date.now(),
): boolean {
  if (category === 'archived') {
    return !!c.isArchived;
  }
  if (c.isArchived) return false;

  switch (category) {
    case 'last24h':
      return isWhatsAppConversationLastActiveWithin24h(c, nowMs);
    case 'all':
      return true;
    case 'unread':
      return c.unreadCount > 0 || !!c.crmForceUnread;
    case 'agendados':
      return conversationHasAnyTag(c, categoryTagIds.agendados);
    case 'fuera_cobertura':
      return conversationHasAnyTag(c, categoryTagIds.fuera_cobertura);
    case 'trabajo':
      return conversationHasAnyTag(c, categoryTagIds.trabajo);
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export function computeTabCounts(
  conversations: WhatsAppConversation[],
  tags: TagLike[] = [],
  overrides?: CategoryTagIdOverrides,
): WhatsAppTabCounts {
  const categoryTagIds = resolveAllCategoryTagIds(tags, overrides);
  let last24h = 0;
  let all = 0;
  let unread = 0;
  let archived = 0;
  let agendados = 0;
  let fueraCobertura = 0;
  let trabajo = 0;
  const nowMs = Date.now();

  for (const c of conversations) {
    if (c.isArchived) {
      archived += 1;
      continue;
    }

    all += 1;

    if (isWhatsAppConversationLastActiveWithin24h(c, nowMs)) last24h += 1;

    if (c.unreadCount > 0 || c.crmForceUnread) unread += 1;

    if (conversationHasAnyTag(c, categoryTagIds.agendados)) agendados += 1;
    if (conversationHasAnyTag(c, categoryTagIds.fuera_cobertura)) fueraCobertura += 1;
    if (conversationHasAnyTag(c, categoryTagIds.trabajo)) trabajo += 1;
  }

  return { last24h, all, unread, archived, agendados, fueraCobertura, trabajo };
}

function computeTagCountsForArchiveState(
  conversations: WhatsAppConversation[],
  archived: boolean,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of conversations) {
    if (!!c.isArchived !== archived) continue;
    const ids = c.tagIds;
    if (!ids?.length) continue;
    for (const id of ids) {
      if (!id) continue;
      out[id] = (out[id] ?? 0) + 1;
    }
  }
  return out;
}

/** Conteo por tag en conversaciones activas (mismo universo que el filtro del inbox). */
export function computeTagCounts(conversations: WhatsAppConversation[]): Record<string, number> {
  return computeTagCountsForArchiveState(conversations, false);
}

/** Conteo por tag en conversaciones archivadas (para aviso y filtro en pestaña Archivados). */
export function computeArchivedTagCounts(conversations: WhatsAppConversation[]): Record<string, number> {
  return computeTagCountsForArchiveState(conversations, true);
}

export function computeWhatsAppInboxMetrics(
  conversations: WhatsAppConversation[],
  tags: TagLike[] = [],
  overrides?: CategoryTagIdOverrides,
): WhatsAppInboxMetrics {
  const categoryTagIds = resolveAllCategoryTagIds(tags, overrides);
  return {
    totalConversations: conversations.length,
    tabCounts: computeTabCounts(conversations, tags, overrides),
    tagCountsById: computeTagCounts(conversations),
    archivedTagCountsById: computeArchivedTagCounts(conversations),
    categoryTagIds,
  };
}

export function getTabCountForCategory(
  tabCounts: WhatsAppTabCounts,
  category: InboxCategoryId,
): number {
  switch (category) {
    case 'last24h':
      return tabCounts.last24h;
    case 'all':
      return tabCounts.all;
    case 'unread':
      return tabCounts.unread;
    case 'archived':
      return tabCounts.archived;
    case 'agendados':
      return tabCounts.agendados;
    case 'fuera_cobertura':
      return tabCounts.fueraCobertura;
    case 'trabajo':
      return tabCounts.trabajo;
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export function isCategoryOwnedTag(
  tagId: string,
  categoryTagIds: Record<InboxTagCategoryId, string[]>,
): boolean {
  return collectCategoryOwnedTagIds(categoryTagIds).has(tagId);
}

/** Tags disponibles como filtro secundario (excluye los que definen categorías fijas). */
export function getSecondaryFilterTags(
  tags: TagLike[],
  categoryTagIds: Record<InboxTagCategoryId, string[]>,
): TagLike[] {
  const owned = collectCategoryOwnedTagIds(categoryTagIds);
  return tags.filter((t) => !owned.has(t.id));
}

export { isInboxTagCategoryId };
