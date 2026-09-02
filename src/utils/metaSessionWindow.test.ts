import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_WINDOW_CLOSED_CODE,
  buildMetaSessionWindow,
  formatSessionWindowRemainingLabel,
  freeformSendBlockReason,
  getMetaSessionWindow,
  isSessionComposerLocked,
  newestInboundTimestamp,
  nextLastInboundAt,
  resolveMetaSessionWindow,
  sessionWindowHue,
  sessionWindowRemainingRatio,
  sessionWindowStrokeColor,
} from '../../supabase/functions/_shared/metaSessionWindow';
import {
  getLoadedConversationInbound,
  isWithinMetaSessionWindow,
} from './whatsappTemplateSuggestions';
import { scheduleMetaSessionExpiry } from '../hooks/useMetaSessionWindow';

afterEach(() => {
  vi.useRealTimers();
});

describe('getMetaSessionWindow', () => {
  it('closes deterministically at the exact 24-hour boundary', () => {
    const lastInboundAt = '2026-08-04T12:00:00.000Z';

    expect(
      getMetaSessionWindow(lastInboundAt, '2026-08-05T11:59:59.999Z').status,
    ).toBe('open');
    expect(
      getMetaSessionWindow(lastInboundAt, '2026-08-05T12:00:00.000Z'),
    ).toEqual({
      status: 'closed',
      lastInboundAt,
      expiresAt: '2026-08-05T12:00:00.000Z',
      requiresTemplate: true,
    });
  });

  it('keeps the frontend compatibility utility on the shared boundary contract', () => {
    expect(
      isWithinMetaSessionWindow(
        new Date('2026-08-04T12:00:00.000Z'),
        new Date('2026-08-05T12:00:00.000Z'),
      ),
    ).toBe(false);
  });
});

describe('buildMetaSessionWindow', () => {
  it('uses only the newest valid inbound message even when messages are unsorted', () => {
    const window = buildMetaSessionWindow(
      [
        {
          direction: 'outbound',
          createdAt: '2026-08-05T11:55:00.000Z',
        },
        {
          direction: 'inbound',
          createdAt: '2026-08-05T10:00:00.000Z',
        },
        {
          direction: 'inbound',
          createdAt: '2026-08-05T11:00:00.000Z',
        },
        {
          direction: 'inbound',
          createdAt: 'invalid',
        },
      ],
      '2026-08-05T12:00:00.000Z',
    );

    expect(window).toEqual({
      status: 'open',
      lastInboundAt: '2026-08-05T11:00:00.000Z',
      expiresAt: '2026-08-06T11:00:00.000Z',
      requiresTemplate: false,
    });
  });

  it('returns unknown when no valid inbound timestamp exists', () => {
    expect(
      buildMetaSessionWindow(
        [
          { direction: 'outbound', createdAt: '2026-08-05T11:00:00.000Z' },
          { direction: 'inbound', createdAt: 'invalid' },
        ],
        '2026-08-05T12:00:00.000Z',
      ),
    ).toEqual({
      status: 'unknown',
      lastInboundAt: null,
      expiresAt: null,
      requiresTemplate: true,
    });
  });
});

describe('getLoadedConversationInbound', () => {
  it('preserves the newest inbound timestamp when a later outbound message exists', () => {
    const loadedInbound = getLoadedConversationInbound('conversation-1', [
      {
        id: 'inbound',
        direction: 'inbound',
        senderType: 'user',
        status: 'received',
        createdAt: new Date('2026-08-05T11:00:00.000Z'),
      },
      {
        id: 'outbound',
        direction: 'outbound',
        senderType: 'agent',
        status: 'sent',
        createdAt: new Date('2026-08-05T11:30:00.000Z'),
      },
    ]);

    expect(loadedInbound.conversationId).toBe('conversation-1');
    expect(loadedInbound.lastInboundAt?.toISOString()).toBe(
      '2026-08-05T11:00:00.000Z',
    );
  });
});

describe('resolveMetaSessionWindow', () => {
  it('reevaluates a server snapshot against the current clock after expiry', () => {
    const snapshot = {
      status: 'open' as const,
      lastInboundAt: '2026-08-04T12:00:00.000Z',
      expiresAt: '2026-08-05T12:00:00.000Z',
      requiresTemplate: false,
    };

    expect(
      resolveMetaSessionWindow({
        snapshot,
        now: '2026-08-05T11:59:59.999Z',
      }).status,
    ).toBe('open');
    expect(
      resolveMetaSessionWindow({
        snapshot,
        now: '2026-08-05T12:00:00.000Z',
      }),
    ).toEqual({
      status: 'closed',
      lastInboundAt: snapshot.lastInboundAt,
      expiresAt: snapshot.expiresAt,
      requiresTemplate: true,
    });
  });

  it('prefers a newer inbound timestamp over a stale closed snapshot', () => {
    expect(
      resolveMetaSessionWindow({
        snapshot: {
          status: 'closed',
          lastInboundAt: '2026-08-03T12:00:00.000Z',
          expiresAt: '2026-08-04T12:00:00.000Z',
          requiresTemplate: true,
        },
        lastInboundAt: '2026-08-05T11:30:00.000Z',
        now: '2026-08-05T12:00:00.000Z',
      }),
    ).toEqual({
      status: 'open',
      lastInboundAt: '2026-08-05T11:30:00.000Z',
      expiresAt: '2026-08-06T11:30:00.000Z',
      requiresTemplate: false,
    });
  });
});

describe('session window remaining helpers', () => {
  it('maps a full window to ratio 1 and green hue', () => {
    expect(
      sessionWindowRemainingRatio(
        '2026-08-05T12:00:00.000Z',
        '2026-08-05T12:00:00.000Z',
      ),
    ).toBe(1);
    expect(sessionWindowHue(1)).toBe(120);
    expect(sessionWindowStrokeColor(1)).toBe('hsl(120, 90%, 42%)');
  });

  it('maps a half window to amber and a closed window to ratio 0 / red', () => {
    expect(
      sessionWindowRemainingRatio(
        '2026-08-04T12:00:00.000Z',
        '2026-08-05T00:00:00.000Z',
      ),
    ).toBe(0.5);
    expect(sessionWindowHue(0.5)).toBe(60);
    expect(
      sessionWindowRemainingRatio(
        '2026-08-04T12:00:00.000Z',
        '2026-08-05T12:00:00.000Z',
      ),
    ).toBe(0);
    expect(sessionWindowHue(0)).toBe(0);
    expect(sessionWindowStrokeColor(0)).toBe('hsl(0, 90%, 42%)');
  });

  it('returns null remaining for an unknown inbound and labels closed vs open', () => {
    expect(sessionWindowRemainingRatio(null, '2026-08-05T12:00:00.000Z')).toBeNull();
    expect(formatSessionWindowRemainingLabel(null)).toBe(
      'Desconocida · requiere plantilla',
    );
    expect(
      formatSessionWindowRemainingLabel(
        '2026-08-04T12:00:00.000Z',
        '2026-08-05T12:00:00.000Z',
      ),
    ).toBe('Cerrada · requiere plantilla');
    expect(
      formatSessionWindowRemainingLabel(
        '2026-08-05T10:00:00.000Z',
        '2026-08-05T12:00:00.000Z',
      ),
    ).toBe('Abierta · 22 h');
  });

  it('keeps the newest inbound timestamp and blocks free-form when closed', () => {
    expect(
      nextLastInboundAt('2026-08-05T10:00:00.000Z', '2026-08-05T09:00:00.000Z'),
    ).toBe('2026-08-05T10:00:00.000Z');
    expect(
      newestInboundTimestamp(
        '2026-08-05T10:00:00.000Z',
        new Date('2026-08-05T11:00:00.000Z'),
        null,
      )?.toISOString(),
    ).toBe('2026-08-05T11:00:00.000Z');
    expect(freeformSendBlockReason('2026-08-05T11:00:00.000Z', '2026-08-05T12:00:00.000Z')).toBeNull();
    expect(
      freeformSendBlockReason('2026-08-04T12:00:00.000Z', '2026-08-05T12:00:00.000Z'),
    ).toBe(SESSION_WINDOW_CLOSED_CODE);
    expect(
      isSessionComposerLocked({
        isLidThread: false,
        sessionWindow: { requiresTemplate: true },
      }),
    ).toBe(true);
    expect(
      isSessionComposerLocked({
        isLidThread: false,
        sessionWindow: { requiresTemplate: false },
      }),
    ).toBe(false);
  });
});

describe('scheduleMetaSessionExpiry', () => {
  it('fires once at expiry and exposes cleanup without an interval', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T11:59:59.999Z'));
    const onExpire = vi.fn();

    const cleanup = scheduleMetaSessionExpiry(
      '2026-08-05T12:00:00.000Z',
      onExpire,
    );

    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the pending expiry callback on cleanup', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T11:00:00.000Z'));
    const onExpire = vi.fn();

    const cleanup = scheduleMetaSessionExpiry(
      '2026-08-05T12:00:00.000Z',
      onExpire,
    );
    cleanup();
    vi.advanceTimersByTime(60 * 60 * 1000);

    expect(onExpire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
