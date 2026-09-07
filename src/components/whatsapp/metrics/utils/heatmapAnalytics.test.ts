import { describe, expect, it } from 'vitest';
import type { HeatmapPoint } from '@/types/whatsapp';
import { buildDensityZones } from './heatmapAnalytics';

const point = (id: string, lat: number, lng: number): HeatmapPoint => ({
  id,
  lat,
  lng,
  source: 'gps',
  layer: 'standard',
  status: 'COMPLETED',
  scheduledStart: null,
});

describe('buildDensityZones', () => {
  it('groups points into approximate 0.001 degree cells and ranks density', () => {
    const zones = buildDensityZones([
      point('a', 4.81331, -75.69611),
      point('b', 4.81334, -75.69614),
      point('c', 4.82001, -75.70001),
    ]);

    expect(zones).toHaveLength(2);
    expect(zones[0]).toMatchObject({
      key: '4.813,-75.696',
      count: 2,
    });
    expect(zones[0].lat).toBeCloseTo(4.813325);
  });
});
