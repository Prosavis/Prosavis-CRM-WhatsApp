import { describe, expect, it } from 'vitest';
import { computeNextSendAt, nextSchedulerRunAt } from './reactivationNextSend';

describe('computeNextSendAt', () => {
  it('returns null for terminal statuses', () => {
    const asOf = new Date('2026-07-21T20:00:00.000Z');
    expect(
      computeNextSendAt({
        sequenceStep: 1,
        lastContactAt: '2026-07-21T18:01:00.000Z',
        status: 'opt_out',
        asOf,
      }),
    ).toBeNull();
    expect(
      computeNextSendAt({
        sequenceStep: 6,
        lastContactAt: '2026-07-01T12:00:00.000Z',
        status: 'completed',
        asOf,
      }),
    ).toBeNull();
    expect(
      computeNextSendAt({
        sequenceStep: 2,
        lastContactAt: '2026-07-10T12:00:00.000Z',
        status: 'paused_reply',
        asOf,
      }),
    ).toBeNull();
  });

  it('uses next global cron when already due or eligible', () => {
    // 21 jul 2026 15:00 Bogota = 20:00 UTC → next cron is 22 jul 12:00 Bogota = 17:00 UTC
    const asOf = new Date('2026-07-21T20:00:00.000Z');
    const expected = nextSchedulerRunAt(asOf);
    expect(expected).toBe('2026-07-22T17:00:00.000Z');
    expect(
      computeNextSendAt({
        sequenceStep: 0,
        lastContactAt: null,
        status: 'eligible',
        asOf,
      }),
    ).toBe(expected);
    expect(
      computeNextSendAt({
        sequenceStep: 1,
        lastContactAt: '2026-07-14T17:00:00.000Z',
        status: 'due',
        asOf,
      }),
    ).toBe(expected);
  });

  it('waits ~7 days after step 1 send at 13:01 (not next-day cron)', () => {
    // Contacto 21 jul 13:01 Bogota = 18:01 UTC
    const lastContactAt = '2026-07-21T18:01:00.000Z';
    const asOf = new Date('2026-07-21T20:00:00.000Z');
    const nextSend = computeNextSendAt({
      sequenceStep: 1,
      lastContactAt,
      status: 'waiting',
      asOf,
    });
    expect(nextSend).not.toBeNull();
    // Mañana 12:00 CO no debe aparecer
    expect(nextSend).not.toBe(nextSchedulerRunAt(asOf));
    // Gap 7d desde 13:01 → eligible a las 13:01 del 28 jul; cron 28 jul 12:00 aún no;
    // primer cron válido = 29 jul 12:00 Bogota = 17:00 UTC
    expect(nextSend).toBe('2026-07-29T17:00:00.000Z');
  });

  it('is due on the first cron at/after exact gap boundary', () => {
    // last contact 21 jul 12:00 Bogota = 17:00 UTC → +7d = 28 jul 12:00 exactly
    const lastContactAt = '2026-07-21T17:00:00.000Z';
    const asOf = new Date('2026-07-21T20:00:00.000Z');
    expect(
      computeNextSendAt({
        sequenceStep: 1,
        lastContactAt,
        status: 'waiting',
        asOf,
      }),
    ).toBe('2026-07-28T17:00:00.000Z');
  });
});
