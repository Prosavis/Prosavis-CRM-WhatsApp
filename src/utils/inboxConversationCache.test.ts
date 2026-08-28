import { describe, expect, it, vi } from 'vitest';
import type { WhatsAppConversation } from '@/services/whatsappService';
import {
  applyInboxRealtimeEvent,
  conversationMatchesListFilter,
  createInboxRealtimeCoalescer,
  INBOX_CONVERSATION_SELECT,
  INBOX_REALTIME_DEBOUNCE_MS,
  shouldRefetchOnVisibility,
  sortInboxConversations,
  type InboxConversationRowLike,
} from './inboxConversationCache';

function conv(partial: Partial<WhatsAppConversation> & { id: string }): WhatsAppConversation {
  return {
    state: 'active',
    unreadCount: 0,
    ...partial,
  };
}

function mapRow(row: InboxConversationRowLike): WhatsAppConversation {
  return conv({
    id: String(row.stable_key),
    phoneNumberId: row.phone_number_id ?? undefined,
    unreadCount: Number(row.unread_count ?? 0),
    lastMessageAt: row.last_message_at ? new Date(String(row.last_message_at)) : undefined,
    isPinned: row.is_pinned === true,
    isArchived: row.is_archived === true,
    lastMessageText: row.last_message_text ? String(row.last_message_text) : undefined,
  });
}

const bot = 'bot-line';
const filter = { phoneNumberId: bot, includeOrphans: true };

describe('inboxConversationCache', () => {
  it('C1: coalesces rapid events into a single flush without a full refetch hook', () => {
    const onFlush = vi.fn();
    const timers: Array<() => void> = [];
    const coalescer = createInboxRealtimeCoalescer({
      debounceMs: INBOX_REALTIME_DEBOUNCE_MS,
      schedule: (fn) => {
        timers.push(fn);
        return { cancel: () => undefined };
      },
      onFlush,
    });

    for (let i = 0; i < 12; i += 1) {
      coalescer.push({
        eventType: 'UPDATE',
        new: { id: `u${i}`, stable_key: `k${i}`, phone_number_id: bot, unread_count: 1 },
      });
    }

    expect(onFlush).not.toHaveBeenCalled();
    expect(coalescer.pendingCount).toBe(12);
    timers.at(-1)?.();
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush.mock.calls[0][0]).toHaveLength(12);
    expect(coalescer.flushCount).toBe(1);
  });

  it('C2: UPDATE merges by stable_key', () => {
    const current = [conv({ id: '57300', unreadCount: 3, lastMessageText: 'hola' })];
    const result = applyInboxRealtimeEvent(
      current,
      new Map(),
      {
        eventType: 'UPDATE',
        new: {
          id: 'uuid-1',
          stable_key: '57300',
          phone_number_id: bot,
          unread_count: 0,
          last_message_text: 'hola',
        },
      },
      filter,
      mapRow,
    );
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].unreadCount).toBe(0);
    expect(result.uuidToStableKey.get('uuid-1')).toBe('57300');
  });

  it('C3: INSERT inbound appears at the top', () => {
    const older = conv({
      id: 'old',
      lastMessageAt: new Date('2026-01-01T00:00:00Z'),
    });
    const result = applyInboxRealtimeEvent(
      [older],
      new Map(),
      {
        eventType: 'INSERT',
        new: {
          id: 'uuid-new',
          stable_key: 'new',
          phone_number_id: bot,
          last_message_at: '2026-08-28T12:00:00Z',
          last_message_text: 'nuevo',
          unread_count: 1,
        },
      },
      filter,
      mapRow,
    );
    expect(result.conversations[0].id).toBe('new');
    expect(result.conversations).toHaveLength(2);
  });

  it('C4: DELETE removes the conversation even when only the uuid is present', () => {
    const current = [conv({ id: '57300' }), conv({ id: 'keep' })];
    const uuids = new Map([['uuid-1', '57300']]);
    const result = applyInboxRealtimeEvent(
      current,
      uuids,
      { eventType: 'DELETE', old: { id: 'uuid-1' } },
      filter,
      mapRow,
    );
    expect(result.conversations.map((c) => c.id)).toEqual(['keep']);
    expect(result.uuidToStableKey.has('uuid-1')).toBe(false);
  });

  it('C8: sibling line events do not enter the filtered list', () => {
    const current = [conv({ id: 'bot-1', phoneNumberId: bot })];
    const result = applyInboxRealtimeEvent(
      current,
      new Map(),
      {
        eventType: 'INSERT',
        new: {
          id: 'uuid-c',
          stable_key: 'commercial-1',
          phone_number_id: 'commercial-line',
          unread_count: 4,
        },
      },
      filter,
      mapRow,
    );
    expect(result.changed).toBe(false);
    expect(result.conversations).toHaveLength(1);
  });

  it('C9: INSERT of an existing stable_key does not duplicate', () => {
    const current = [conv({ id: '57300', unreadCount: 1 })];
    const result = applyInboxRealtimeEvent(
      current,
      new Map([['uuid-1', '57300']]),
      {
        eventType: 'INSERT',
        new: {
          id: 'uuid-1',
          stable_key: '57300',
          phone_number_id: bot,
          unread_count: 2,
        },
      },
      filter,
      mapRow,
    );
    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0].unreadCount).toBe(2);
  });

  it('C9b: dispose ignores later events', () => {
    const onFlush = vi.fn();
    const coalescer = createInboxRealtimeCoalescer({
      debounceMs: 0,
      schedule: (fn) => {
        fn();
        return { cancel: () => undefined };
      },
      onFlush,
    });
    coalescer.dispose();
    coalescer.push({ eventType: 'INSERT', new: { stable_key: 'x' } });
    expect(onFlush).not.toHaveBeenCalled();
    expect(coalescer.disposed).toBe(true);
  });

  it('C13: unread-only UPDATE does not reorder when last_message_at is unchanged', () => {
    const a = conv({
      id: 'a',
      lastMessageAt: new Date('2026-08-01T00:00:00Z'),
      unreadCount: 2,
    });
    const b = conv({
      id: 'b',
      lastMessageAt: new Date('2026-07-01T00:00:00Z'),
      unreadCount: 0,
    });
    const result = applyInboxRealtimeEvent(
      [a, b],
      new Map(),
      {
        eventType: 'UPDATE',
        new: {
          id: 'uuid-a',
          stable_key: 'a',
          phone_number_id: bot,
          last_message_at: '2026-08-01T00:00:00Z',
          unread_count: 0,
        },
      },
      filter,
      mapRow,
    );
    expect(result.conversations.map((c) => c.id)).toEqual(['a', 'b']);
    expect(result.conversations[0].unreadCount).toBe(0);
  });

  it('C7: visibility refetch only when the cache is stale', () => {
    expect(shouldRefetchOnVisibility(null, 1000)).toBe(true);
    expect(shouldRefetchOnVisibility(1000, 10_000)).toBe(false);
    expect(shouldRefetchOnVisibility(1000, 40_000)).toBe(true);
  });

  it('matches orphan rows for the bot line and excludes them for commercial', () => {
    const orphan = { stable_key: 'x', phone_number_id: null };
    expect(conversationMatchesListFilter(orphan, { phoneNumberId: bot, includeOrphans: true })).toBe(
      true,
    );
    expect(
      conversationMatchesListFilter(orphan, { phoneNumberId: 'commercial', includeOrphans: false }),
    ).toBe(false);
  });

  it('sorts pinned conversations first', () => {
    const sorted = sortInboxConversations([
      conv({ id: 'old', lastMessageAt: new Date('2026-08-20T00:00:00Z') }),
      conv({ id: 'pin', isPinned: true, lastMessageAt: new Date('2026-01-01T00:00:00Z') }),
    ]);
    expect(sorted[0].id).toBe('pin');
  });

  it('list select is a column allowlist, not star', () => {
    expect(INBOX_CONVERSATION_SELECT.includes('*')).toBe(false);
    expect(INBOX_CONVERSATION_SELECT).toContain('stable_key');
    expect(INBOX_CONVERSATION_SELECT).not.toContain('metadata');
  });
});
