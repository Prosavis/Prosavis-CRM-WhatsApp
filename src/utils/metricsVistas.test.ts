import { describe, expect, it } from 'vitest';
import {
  applyMetricsScope,
  applyMetricsVista,
  metricsPeriodRange,
  resolveMetricsDays,
  resolveMetricsVista,
} from './metricsVistas';

describe('metricsVistas', () => {
  it('defaults to calidad when vista is missing', () => {
    expect(resolveMetricsVista(new URLSearchParams('tab=metrics'))).toBe('calidad');
  });

  it('reads a valid vista from the query', () => {
    expect(resolveMetricsVista(new URLSearchParams('tab=metrics&vista=mapa'))).toBe('mapa');
  });

  it('falls back when vista is unknown', () => {
    expect(resolveMetricsVista(new URLSearchParams('vista=foo'))).toBe('calidad');
  });

  it('omits vista=calidad from the URL and keeps other tabs explicit', () => {
    const next = applyMetricsVista(new URLSearchParams('tab=metrics&vista=mapa'), 'calidad');
    expect(next.get('tab')).toBe('metrics');
    expect(next.get('vista')).toBeNull();
    expect(applyMetricsVista(new URLSearchParams('tab=metrics'), 'friccion').get('vista')).toBe(
      'friccion',
    );
  });

  it('reads supported periods and falls back for invalid values', () => {
    expect(resolveMetricsDays(new URLSearchParams('days=60'))).toBe(60);
    expect(resolveMetricsDays(new URLSearchParams('days=365'))).toBe(30);
    expect(resolveMetricsDays(new URLSearchParams('days=foo'))).toBe(30);
  });

  it('persists and clears analysis scope without dropping unrelated params', () => {
    const next = applyMetricsScope(
      new URLSearchParams('tab=metrics&vista=mapa&broadcastJob=abc'),
      {
        days: '90',
        mapMode: 'points',
        status: 'COMPLETED',
        layer: null,
      },
    );
    expect(next.get('broadcastJob')).toBe('abc');
    expect(next.get('days')).toBe('90');
    expect(next.get('mapMode')).toBe('points');
    expect(next.get('status')).toBe('COMPLETED');
    expect(next.get('layer')).toBeNull();
  });

  it('builds an inclusive UTC period for map queries', () => {
    expect(metricsPeriodRange(30, new Date('2026-09-07T16:00:00.000Z'))).toEqual({
      from: '2026-08-09',
      to: '2026-09-07',
    });
  });
});
