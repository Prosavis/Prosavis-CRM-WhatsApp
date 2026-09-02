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
        const samePreview =
          prev.lastMessageAt?.getTime() === mapped.lastMessageAt?.getTime() &&
          prev.isPinned === mapped.isPinned;
        const replaced = [...next];
        replaced[idx] = mapped;
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
