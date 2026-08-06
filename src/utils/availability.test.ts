import { describe, expect, it, vi } from 'vitest';
import {
  appendRealAvailabilityContext,
  getBogotaAvailabilityHorizon,
  loadRealAvailability,
  normalizeAvailabilitySlots,
  overwriteBookingAvailability,
  resolveOfficialDuration,
} from '../../supabase/functions/_shared/availability';
import { INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET } from '../../supabase/functions/_shared/inboxAiContextFormat';

describe('getBogotaAvailabilityHorizon', () => {
  it('uses Bogotá date keys and a seven-day inclusive horizon', () => {
    expect(getBogotaAvailabilityHorizon(
      new Date('2026-08-07T03:30:00.000Z'),
    )).toEqual({
      startDate: '2026-08-06',
      endDate: '2026-08-12',
    });
  });
});

describe('resolveOfficialDuration', () => {
  it.each([120, 180, 240, 360, 480])(
    'preserves official duration %i',
    (duration) => {
      expect(resolveOfficialDuration(duration)).toBe(duration);
    },
  );

  it.each([null, undefined, 60, 150, '240'])(
    'falls back to 240 minutes for %s',
    (duration) => {
      expect(resolveOfficialDuration(duration)).toBe(240);
    },
  );
});

describe('normalizeAvailabilitySlots', () => {
  it('validates, canonicalizes, deduplicates and sorts ISO slots', () => {
    expect(normalizeAvailabilitySlots({
      slots: [
        '2026-08-06T09:00:00-05:00',
        'not-a-date',
        '2026-08-06T13:00:00.000Z',
        '2026-08-06T14:00:00.000Z',
        123,
      ],
    })).toEqual([
      '2026-08-06T13:00:00.000Z',
      '2026-08-06T14:00:00.000Z',
    ]);
  });

  it('degrades malformed payloads to an empty list', () => {
    expect(normalizeAvailabilitySlots(null)).toEqual([]);
    expect(normalizeAvailabilitySlots({ slots: 'not-an-array' })).toEqual([]);
  });
});

describe('loadRealAvailability', () => {
  it('requests the Bogotá horizon with the fallback duration', async () => {
    const request = vi.fn().mockResolvedValue({
      slots: ['2026-08-06T12:00:00.000Z'],
    });

    await expect(loadRealAvailability(150, {
      now: new Date('2026-08-06T12:00:00.000Z'),
      request,
    })).resolves.toEqual(['2026-08-06T12:00:00.000Z']);
    expect(request).toHaveBeenCalledWith({
      startDate: '2026-08-06',
      endDate: '2026-08-12',
      duration: 240,
    });
  });

  it('degrades timeout and bridge failures to [] with a structured warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const request = vi.fn().mockRejectedValue(new Error('aborted'));

    await expect(loadRealAvailability(240, { request })).resolves.toEqual([]);
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      scope: 'booking-availability',
      event: 'firebase-availability-degraded',
      error: 'aborted',
    });
  });
});

describe('booking availability grounding', () => {
  it('overwrites model-provided slots unconditionally', () => {
    expect(overwriteBookingAvailability(
      {
        stage: 'availability',
        availableSlots: ['invented-slot'],
      },
      [],
    )).toEqual({
      stage: 'availability',
      availableSlots: [],
    });
  });

  it('adds the exact real-availability section within the 78,000-character ceiling', () => {
    const latest = 'ÚLTIMO MENSAJE';
    const base = [
      '=== Perfil directorio ===',
      'Cliente real',
      '',
      '=== Historial WhatsApp ===',
      `${'x'.repeat(INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET)}${latest}`,
    ].join('\n');

    const context = appendRealAvailabilityContext(base, [
      '2026-08-06T12:00:00.000Z',
    ]);

    expect(context).toContain('=== Disponibilidad real (próximos días) ===');
    expect(context).toContain('- 2026-08-06T12:00:00.000Z');
    expect(context).toContain(latest);
    expect(context.length).toBeLessThanOrEqual(INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET);
  });
});
