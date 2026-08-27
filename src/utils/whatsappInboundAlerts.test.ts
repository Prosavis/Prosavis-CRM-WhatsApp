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
});
