import { describe, expect, it } from 'vitest';
import { formatMetricPct, safeRate } from './metricsTheme';

describe('metricsTheme formatters', () => {
  it('does not hide inconsistent rates above 100 percent', () => {
    expect(safeRate(3, 2)).toBe(150);
  });

  it('handles a missing denominator without NaN', () => {
    expect(safeRate(3, 0)).toBe(0);
  });

  it('formats percentages for the Spanish operational UI', () => {
    expect(formatMetricPct(26.5)).toBe('26,5%');
  });
});
