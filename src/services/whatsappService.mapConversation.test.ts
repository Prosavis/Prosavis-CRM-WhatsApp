import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(),
  },
}));

import { mapConversationRow } from './whatsappService';

describe('mapConversationRow last_inbound_at', () => {
  it('maps last_inbound_at onto lastInboundAt', () => {
    const mapped = mapConversationRow({
      stable_key: '573001112233',
      last_inbound_at: '2026-09-01T12:00:00.000Z',
      last_message_at: '2026-09-01T15:00:00.000Z',
      last_message_direction: 'outbound',
      unread_count: 0,
      tag_ids: [],
    });

    expect(mapped.lastInboundAt?.toISOString()).toBe('2026-09-01T12:00:00.000Z');
    expect(mapped.lastMessageAt?.toISOString()).toBe('2026-09-01T15:00:00.000Z');
  });

  it('leaves lastInboundAt undefined when the column is missing', () => {
    const mapped = mapConversationRow({
      stable_key: '573001112233',
      unread_count: 0,
      tag_ids: [],
    });
    expect(mapped.lastInboundAt).toBeUndefined();
  });
});
