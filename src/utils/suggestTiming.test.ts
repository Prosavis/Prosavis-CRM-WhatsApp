import { describe, expect, it, vi } from 'vitest';
import { createStageTimer, percentileNearestRank } from '../../supabase/functions/_shared/suggestTiming';

describe('createStageTimer', () => {
  it('records each stage once and keeps the total', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-11T12:00:00.000Z'));
    const timer = createStageTimer();
    timer.record('auth', 12, { ok: true });
    vi.setSystemTime(new Date('2026-11-11T12:00:01.000Z'));
    const snapshot = timer.snapshot();
    expect(snapshot.stages.auth).toBe(12);
    expect(snapshot.extras.auth).toEqual({ ok: true });
    expect(snapshot.totalMs).toBe(1000);
    vi.useRealTimers();
  });
});

describe('percentileNearestRank', () => {
  it('uses the nearest rank', () => {
    expect(percentileNearestRank([10, 20, 30, 40], 50)).toBe(20);
    expect(percentileNearestRank([10, 20, 30, 40], 95)).toBe(40);
    expect(percentileNearestRank([], 50)).toBeNull();
  });
});
