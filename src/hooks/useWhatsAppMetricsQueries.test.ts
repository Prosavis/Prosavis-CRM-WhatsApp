import { describe, expect, it } from 'vitest';
import { vistaNeedsHeatmap, vistaNeedsQuality } from './useWhatsAppMetricsQueries';

describe('useWhatsAppMetricsQueries vista gates', () => {
  it('loads quality only for calidad and friccion', () => {
    expect(vistaNeedsQuality('calidad')).toBe(true);
    expect(vistaNeedsQuality('friccion')).toBe(true);
    expect(vistaNeedsQuality('resumen')).toBe(false);
    expect(vistaNeedsQuality('app')).toBe(false);
  });

  it('loads the heatmap only for mapa', () => {
    expect(vistaNeedsHeatmap('mapa')).toBe(true);
    expect(vistaNeedsHeatmap('app')).toBe(false);
  });
});
