import { describe, expect, it } from 'vitest';
import {
  buildMetaSessionWindow,
  getMetaSessionWindow,
} from '../../supabase/functions/_shared/metaSessionWindow';
import { isWithinMetaSessionWindow } from './whatsappTemplateSuggestions';

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
