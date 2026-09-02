import { describe, expect, it } from 'vitest';
import {
  sessionWindowRingDashoffset,
  sessionWindowRingMetrics,
} from './sessionWindowRing';

describe('sessionWindowRing', () => {
  it('sizes the ring around the avatar without overlapping the photo', () => {
    const metrics = sessionWindowRingMetrics(48);
    expect(metrics.outer).toBe(56);
    expect(metrics.radius).toBeGreaterThan(24);
    expect(metrics.circumference).toBeCloseTo(2 * Math.PI * metrics.radius);
  });

  it('maps a full window to a complete arc and an expired window to an empty arc', () => {
    const { circumference } = sessionWindowRingMetrics(40);
    expect(sessionWindowRingDashoffset(circumference, 1)).toBe(0);
    expect(sessionWindowRingDashoffset(circumference, 0)).toBe(circumference);
    expect(sessionWindowRingDashoffset(circumference, 0.5)).toBeCloseTo(circumference / 2);
  });
});
