import { describe, expect, it } from 'vitest';
import {
  detectNewInboundConversations,
  pickLatestInbound,
} from './whatsappInboundAlerts';

describe('whatsappInboundAlerts', () => {
  it('ignores the first snapshot so existing chats do not alert', () => {
    const now = Date.now();
    const first = detectNewInboundConversations(
      [{
        id: '573146283332',
        lastMessageDirection: 'inbound',
        lastMessageAt: new Date(now - 5_000),
      }],
      new Map(),
      now,
    );
    expect(first.candidates).toHaveLength(1);

    const second = detectNewInboundConversations(
      [{
        id: '573146283332',
        lastMessageDirection: 'inbound',
        lastMessageAt: new Date(now - 5_000),
      }],
      first.nextSnapshot,
      now,
    );
    expect(second.candidates).toHaveLength(0);
  });

  it('detects a newer inbound on the same thread', () => {
    const now = Date.now();
    const prev = new Map([['573146283332__1043086062223440', now - 60_000]]);
    const { candidates } = detectNewInboundConversations(
      [{
        id: '573146283332__1043086062223440',
        lastMessageDirection: 'inbound',
        lastMessageAt: new Date(now - 1_000),
      }],
      prev,
      now,
    );
    expect(pickLatestInbound(candidates)?.id).toBe('573146283332__1043086062223440');
  });

  it('does not alert a chat already seen when another list reloads it at the same time', () => {
    const at = new Date('2026-11-11T20:15:21.000Z');
    const now = at.getTime() + 30_000;
    const seenOnLineA = detectNewInboundConversations(
      [{
        id: '573146283332',
        lastMessageDirection: 'inbound',
        lastMessageAt: at,
      }],
      new Map(),
      now,
    );

    const otherLine = detectNewInboundConversations(
      [{
        id: '573000000000__1043086062223440',
        lastMessageDirection: 'inbound',
        lastMessageAt: at,
      }],
      seenOnLineA.nextSnapshot,
      now,
    );

    const reloaded = detectNewInboundConversations(
      [{
        id: '573146283332',
        lastMessageDirection: 'inbound',
        lastMessageAt: at,
      }],
      otherLine.nextSnapshot,
      now,
    );
    expect(reloaded.candidates).toHaveLength(0);
  });

  it('does not alert when a stale cache is refreshed back to the time already seen', () => {
    const seenAt = new Date('2026-11-11T20:00:00.000Z');
    const staleAt = new Date('2026-11-11T19:50:00.000Z');
    const now = seenAt.getTime() + 60_000;
    const cache = detectNewInboundConversations(
      [{
        id: '573146283332',
        lastMessageDirection: 'inbound',
        lastMessageAt: staleAt,
      }],
      new Map([['573146283332', seenAt.getTime()]]),
      now,
    );
    expect(cache.candidates).toHaveLength(0);

    const refresh = detectNewInboundConversations(
      [{
        id: '573146283332',
        lastMessageDirection: 'inbound',
        lastMessageAt: seenAt,
      }],
      cache.nextSnapshot,
      now,
    );
    expect(refresh.candidates).toHaveLength(0);
  });

  it('alerts when the refresh is newer than the time already seen', () => {
    const seenAt = new Date('2026-11-11T20:00:00.000Z');
    const staleAt = new Date('2026-11-11T19:50:00.000Z');
    const newerAt = new Date('2026-11-11T20:05:00.000Z');
    const now = newerAt.getTime() + 1_000;
    const cache = detectNewInboundConversations(
      [{
        id: '573146283332',
        lastMessageDirection: 'inbound',
        lastMessageAt: staleAt,
      }],
      new Map([['573146283332', seenAt.getTime()]]),
      now,
    );
    const refresh = detectNewInboundConversations(
      [{
        id: '573146283332',
        lastMessageDirection: 'inbound',
        lastMessageAt: newerAt,
      }],
      cache.nextSnapshot,
      now,
    );
    expect(pickLatestInbound(refresh.candidates)?.id).toBe('573146283332');
  });

  it('does not alert when a chat leaves the list and returns at the same time', () => {
    const at = new Date('2026-11-11T20:15:21.000Z');
    const now = at.getTime() + 30_000;
    const seen = detectNewInboundConversations(
      [{
        id: '573146283332',
        lastMessageDirection: 'inbound',
        lastMessageAt: at,
      }],
      new Map(),
      now,
    );
    const left = detectNewInboundConversations([], seen.nextSnapshot, now);
    const back = detectNewInboundConversations(
      [{
        id: '573146283332',
        lastMessageDirection: 'inbound',
        lastMessageAt: at,
      }],
      left.nextSnapshot,
      now,
    );
    expect(back.candidates).toHaveLength(0);
  });
});
