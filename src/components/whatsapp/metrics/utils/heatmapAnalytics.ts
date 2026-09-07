import type { HeatmapPoint } from '@/types/whatsapp';

export interface DensityZone {
  key: string;
  count: number;
  lat: number;
  lng: number;
}

export function buildDensityZones(points: readonly HeatmapPoint[]): DensityZone[] {
  const zones = new Map<string, { count: number; latTotal: number; lngTotal: number }>();
  for (const point of points) {
    const key = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
    const current = zones.get(key) ?? { count: 0, latTotal: 0, lngTotal: 0 };
    current.count += 1;
    current.latTotal += point.lat;
    current.lngTotal += point.lng;
    zones.set(key, current);
  }
  return [...zones.entries()]
    .map(([key, zone]) => ({
      key,
      count: zone.count,
      lat: zone.latTotal / zone.count,
      lng: zone.lngTotal / zone.count,
    }))
    .toSorted((a, b) => b.count - a.count);
}
