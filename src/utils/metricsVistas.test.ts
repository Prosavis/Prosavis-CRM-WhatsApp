import { describe, expect, it } from 'vitest';
import { applyMetricsVista, resolveMetricsVista } from './metricsVistas';

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
});
