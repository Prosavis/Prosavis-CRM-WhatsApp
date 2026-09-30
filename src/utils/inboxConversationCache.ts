import type { WhatsAppConversation } from '@/services/whatsappService';

export const INBOX_REALTIME_DEBOUNCE_MS = 150;
export const INBOX_VISIBILITY_STALE_MS = 30_000;

export const INBOX_CONVERSATION_SELECT = [
  'id',
  'stable_key',
  'phone',
  'bsuid',
  'state',
  'last_message_text',
  'last_message_at',
  'last_inbound_at',
  'last_message_direction',
  'last_message_outbound_status',
  'unread_count',
  'contact_name',
  'contact_phone',
  'contact_photo_url',
  'whatsapp_profile_name',
  'contact_name_locked',
  'admin_notes',
  'assigned_to',
  'last_intent',
  'user_id',
  'phone_number_id',
  'automated_inbound_disabled',
  'tag_ids',
  'is_archived',
  'archived_at',
  'is_pinned',
  'pinned_at',
  'crm_force_unread',
].join(',');

export type InboxRealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface InboxConversationRowLike {
  id?: string | null;
  stable_key?: string | null;
  phone_number_id?: string | null;
  [key: string]: unknown;
}

export interface InboxRealtimeEvent {
  eventType: InboxRealtimeEventType;
  new?: InboxConversationRowLike | null;
  old?: InboxConversationRowLike | null;
}

export interface InboxListFilter {
  phoneNumberId?: string;
  includeOrphans?: boolean;
}

export function conversationMatchesListFilter(
  row: InboxConversationRowLike | null | undefined,
  filter: InboxListFilter,
): boolean {
  if (!row) return false;
  if (!filter.phoneNumberId) return true;
  const line = row.phone_number_id ?? null;
  if (line === filter.phoneNumberId) return true;
  return filter.includeOrphans !== false && line == null;
}

export function sortInboxConversations(
  conversations: WhatsAppConversation[],
): WhatsAppConversation[] {
  return [...conversations].sort((a, b) => {
    const pin = Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned));
    if (pin !== 0) return pin;
    const aAt = a.lastMessageAt?.getTime() ?? 0;
    const bAt = b.lastMessageAt?.getTime() ?? 0;
    return bAt - aAt;
  });
}

export interface ConversationPreviewMessage {
  stableKey: string;
  text: string;
  at: Date;
  direction: 'inbound' | 'outbound';
  outboundStatus?: string;
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Misma prioridad que `recomputeWhatsAppConversationPreview`: cuerpo, caption, `[tipo]`. */
export function previewTextFromMessageParts(
  messageBody: unknown,
  caption: unknown,
  mediaType: unknown,
): string {
  const body = trimmedString(messageBody);
  if (body) return body;
  const cap = trimmedString(caption);
  if (cap) return cap;
  const media = trimmedString(mediaType);
  return media ? `[${media}]` : '';
}

export function previewFromMessageInsert(
  row: Record<string, unknown> | null | undefined,
): ConversationPreviewMessage | null {
  if (!row || row.hidden_from_panel === true) return null;
  if (trimmedString(row.reaction_to)) return null;
  const stableKey = trimmedString(row.conversation_stable_key);
  const direction = row.direction === 'inbound' || row.direction === 'outbound' ? row.direction : null;
  const createdAt = typeof row.created_at === 'string' ? new Date(row.created_at) : null;
  if (!stableKey || !direction || !createdAt || Number.isNaN(createdAt.getTime())) return null;
  const text = previewTextFromMessageParts(row.message_body, row.caption, row.media_type);
  if (!text) return null;
  return {
    stableKey,
    text,
    at: createdAt,
    direction,
    outboundStatus: direction === 'outbound' ? trimmedString(row.status) || undefined : undefined,
  };
}

function laterDate(a?: Date, b?: Date): Date | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/** El preview local gana si es más nuevo. A igualdad de fecha, el entrante rellena huecos y actualiza el tick. */
export function keepNewerPreview(
  current: WhatsAppConversation,
  incoming: WhatsAppConversation,
): WhatsAppConversation {
  const currentAt = current.lastMessageAt?.getTime() ?? 0;
  const incomingAt = incoming.lastMessageAt?.getTime() ?? 0;
  const base: WhatsAppConversation = {
    ...incoming,
    id: incoming.id || current.id,
    lastInboundAt: laterDate(current.lastInboundAt, incoming.lastInboundAt),
  };

  if (incomingAt > currentAt) {
    const direction = incoming.lastMessageDirection ?? current.lastMessageDirection;
    return {
      ...base,
      lastMessageText: incoming.lastMessageText ?? current.lastMessageText,
      lastMessageAt: incoming.lastMessageAt ?? current.lastMessageAt,
      lastMessageDirection: direction,
      lastMessageOutboundStatus:
        direction === 'outbound'
          ? incoming.lastMessageOutboundStatus ?? current.lastMessageOutboundStatus
          : undefined,
    };
  }

  if (incomingAt < currentAt) {
    const sameText =
      Boolean(incoming.lastMessageText) && incoming.lastMessageText === current.lastMessageText;
    return {
      ...base,
      lastMessageText: current.lastMessageText,
      lastMessageAt: current.lastMessageAt,
      lastMessageDirection: current.lastMessageDirection,
      lastMessageOutboundStatus:
        sameText && current.lastMessageDirection === 'outbound'
          ? incoming.lastMessageOutboundStatus ?? current.lastMessageOutboundStatus
          : current.lastMessageOutboundStatus,
    };
  }

  const direction = incoming.lastMessageDirection ?? current.lastMessageDirection;
  return {
    ...base,
    lastMessageText: incoming.lastMessageText ?? current.lastMessageText,
    lastMessageAt: incoming.lastMessageAt ?? current.lastMessageAt,
    lastMessageDirection: direction,
    lastMessageOutboundStatus:
      direction === 'outbound'
        ? incoming.lastMessageOutboundStatus ?? current.lastMessageOutboundStatus
        : undefined,
  };
}

export function mergeNewerConversationPreviews(
  fetched: WhatsAppConversation[],
  local: WhatsAppConversation[],
): WhatsAppConversation[] {
  if (local.length === 0) return fetched;
  const localById = new Map(local.map((row) => [row.id, row]));
  let resort = false;
  const merged = fetched.map((row) => {
    const prev = localById.get(row.id);
    if (!prev) return row;
    const next = keepNewerPreview(prev, row);
    if ((next.lastMessageAt?.getTime() ?? 0) !== (row.lastMessageAt?.getTime() ?? 0)) resort = true;
    return next;
  });
  return resort ? sortInboxConversations(merged) : merged;
}

export function patchConversationPreview(
  conversations: WhatsAppConversation[],
  message: ConversationPreviewMessage,
): WhatsAppConversation[] {
  const key = message.stableKey.trim();
  const text = message.text.trim();
  if (!key || !text || Number.isNaN(message.at.getTime())) return conversations;
  const idx = conversations.findIndex((row) => row.id === key);
  if (idx === -1) return conversations;
  const prev = conversations[idx];
  const prevAt = prev.lastMessageAt?.getTime() ?? 0;
  const nextAt = message.at.getTime();
  if (nextAt < prevAt) return conversations;
  const outboundStatus = message.direction === 'outbound' ? message.outboundStatus : undefined;
  if (
    nextAt === prevAt &&
    prev.lastMessageText === text &&
    prev.lastMessageDirection === message.direction &&
    prev.lastMessageOutboundStatus === outboundStatus
  ) {
    return conversations;
  }
  const next = [...conversations];
  next[idx] = {
    ...prev,
    lastMessageText: text,
    lastMessageAt: message.at,
    lastMessageDirection: message.direction,
    lastMessageOutboundStatus: outboundStatus,
    lastInboundAt:
      message.direction === 'inbound' ? laterDate(prev.lastInboundAt, message.at) : prev.lastInboundAt,
  };
  return sortInboxConversations(next);
}

export function markConversationPreviewFailed(
  conversations: WhatsAppConversation[],
  stableKey: string,
  text: string,
): WhatsAppConversation[] {
  const key = stableKey.trim();
  const preview = text.trim();
  const idx = conversations.findIndex((row) => row.id === key);
  if (idx === -1 || !preview) return conversations;
  const prev = conversations[idx];
  if (prev.lastMessageText !== preview || prev.lastMessageDirection !== 'outbound') return conversations;
  if (prev.lastMessageOutboundStatus && prev.lastMessageOutboundStatus !== 'pending') return conversations;
  const next = [...conversations];
  next[idx] = { ...prev, lastMessageOutboundStatus: 'failed' };
  return next;
}

export function shouldRefetchOnVisibility(
  lastFullFetchAt: number | null,
  now: number,
  staleMs: number = INBOX_VISIBILITY_STALE_MS,
): boolean {
  if (lastFullFetchAt == null) return true;
  return now - lastFullFetchAt >= staleMs;
}

export interface InboxCacheApplyResult {
  conversations: WhatsAppConversation[];
  uuidToStableKey: Map<string, string>;
  changed: boolean;
}

export function applyInboxRealtimeEvent(
  conversations: WhatsAppConversation[],
  uuidToStableKey: Map<string, string>,
  event: InboxRealtimeEvent,
  filter: InboxListFilter,
  mapRow: (row: InboxConversationRowLike) => WhatsAppConversation,
): InboxCacheApplyResult {
  const nextUuid = new Map(uuidToStableKey);
  let next = conversations;
  let changed = false;

  const remember = (row: InboxConversationRowLike | null | undefined, mapped?: WhatsAppConversation) => {
    const uuid = row?.id?.trim();
    const key = (mapped?.id || row?.stable_key || '').trim();
    if (uuid && key) nextUuid.set(uuid, key);
  };

  const resolveDeleteKey = (oldRow: InboxConversationRowLike | null | undefined): string | null => {
    if (!oldRow) return null;
    const fromStable = oldRow.stable_key?.trim();
    if (fromStable) return fromStable;
    const uuid = oldRow.id?.trim();
    if (uuid && nextUuid.has(uuid)) return nextUuid.get(uuid) ?? null;
    return null;
  };

  switch (event.eventType) {
    case 'INSERT':
    case 'UPDATE': {
      const row = event.new;
      if (!row?.stable_key) break;
      if (!conversationMatchesListFilter(row, filter)) {
        const key = row.stable_key.trim();
        const without = next.filter((c) => c.id !== key);
        if (without.length !== next.length) {
          next = without;
          changed = true;
        }
        const uuid = row.id?.trim();
        if (uuid) nextUuid.delete(uuid);
        break;
      }
      const mapped = mapRow(row);
      remember(row, mapped);
      const idx = next.findIndex((c) => c.id === mapped.id);
      if (idx === -1) {
        next = sortInboxConversations([...next, mapped]);
        changed = true;
      } else {
        const prev = next[idx];
        const merged = keepNewerPreview(prev, mapped);
        const samePreview =
          prev.lastMessageAt?.getTime() === merged.lastMessageAt?.getTime() &&
          prev.isPinned === merged.isPinned;
        const replaced = [...next];
        replaced[idx] = merged;
        next = samePreview ? replaced : sortInboxConversations(replaced);
        changed = true;
      }
      break;
    }
    case 'DELETE': {
      const key = resolveDeleteKey(event.old);
      const uuid = event.old?.id?.trim();
      if (uuid) nextUuid.delete(uuid);
      if (!key) break;
      const without = next.filter((c) => c.id !== key);
      if (without.length !== next.length) {
        next = without;
        changed = true;
      }
      break;
    }
    default: {
      const exhaustive: never = event.eventType;
      return exhaustive;
    }
  }

  return { conversations: next, uuidToStableKey: nextUuid, changed };
}

export function createInboxRealtimeCoalescer(options: {
  debounceMs?: number;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => { cancel: () => void };
  onFlush: (events: InboxRealtimeEvent[]) => void;
}) {
  const debounceMs = options.debounceMs ?? INBOX_REALTIME_DEBOUNCE_MS;
  const now = options.now ?? (() => Date.now());
  const schedule =
    options.schedule ??
    ((fn, ms) => {
      const id = setTimeout(fn, ms);
      return { cancel: () => clearTimeout(id) };
    });

  let pending: InboxRealtimeEvent[] = [];
  let timer: { cancel: () => void } | null = null;
  let flushCount = 0;
  let lastFlushAt: number | null = null;
  let disposed = false;

  const flush = () => {
    timer = null;
    if (disposed || pending.length === 0) return;
    const batch = pending;
    pending = [];
    flushCount += 1;
    lastFlushAt = now();
    options.onFlush(batch);
  };

  return {
    push(event: InboxRealtimeEvent) {
      if (disposed) return;
      pending.push(event);
      timer?.cancel();
      timer = schedule(flush, debounceMs);
    },
    flushNow: flush,
    dispose() {
      disposed = true;
      timer?.cancel();
      timer = null;
      pending = [];
    },
    get pendingCount() {
      return pending.length;
    },
    get flushCount() {
      return flushCount;
    },
    get lastFlushAt() {
      return lastFlushAt;
    },
    get disposed() {
      return disposed;
    },
  };
}
