import { describe, expect, it } from 'vitest';
import {
  applyMetricsScope,
  applyMetricsVista,
  METRICS_DAYS_PREF_KEY,
  metricsPeriodLabel,
  metricsPeriodRange,
  persistAndApplyMetricsDays,
  readMetricsDaysPreferences,
  resolveMetricsDays,
  resolveMetricsVista,
  vistaDayParam,
  writeMetricsDaysPreference,
} from './metricsVistas';

const store = new Map<string, string>();

function installLocalStorage() {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
}

describe('metricsVistas', () => {
  it('defaults to resumen when vista is missing', () => {
    expect(resolveMetricsVista(new URLSearchParams('tab=metrics'))).toBe('resumen');
  });

  it('reads a valid vista from the query', () => {
    expect(resolveMetricsVista(new URLSearchParams('tab=metrics&vista=mapa'))).toBe('mapa');
  });

  it('falls back when vista is unknown', () => {
    expect(resolveMetricsVista(new URLSearchParams('vista=foo'))).toBe('resumen');
  });

  it('omits vista=resumen from the URL and keeps other tabs explicit', () => {
    const next = applyMetricsVista(new URLSearchParams('tab=metrics&vista=mapa'), 'resumen');
    expect(next.get('tab')).toBe('metrics');
    expect(next.get('vista')).toBeNull();
    expect(applyMetricsVista(new URLSearchParams('tab=metrics'), 'friccion').get('vista')).toBe(
      'friccion',
    );
  });

  it('reads supported periods and falls back to histórico for invalid values', () => {
    expect(resolveMetricsDays(new URLSearchParams('days=60'))).toBe(60);
    expect(resolveMetricsDays(new URLSearchParams('activityDays=14'), 'activityDays')).toBe(14);
    expect(resolveMetricsDays(new URLSearchParams('days=365'))).toBe('all');
    expect(resolveMetricsDays(new URLSearchParams('days=foo'))).toBe('all');
    expect(resolveMetricsDays(new URLSearchParams())).toBe('all');
  });

  it('prefers an explicit URL period over a saved preference', () => {
    expect(resolveMetricsDays(new URLSearchParams('completedDays=14'), 'completedDays', 90)).toBe(14);
    expect(resolveMetricsDays(new URLSearchParams('completedDays=all'), 'completedDays', 30)).toBe('all');
  });

  it('uses the saved view preference when the URL is empty', () => {
    expect(resolveMetricsDays(new URLSearchParams(), 'mapDays', 60)).toBe(60);
    expect(resolveMetricsDays(new URLSearchParams('mapDays=foo'), 'mapDays', 7)).toBe(7);
  });

  it('keeps independent stored periods per view', () => {
    installLocalStorage();
    writeMetricsDaysPreference('completedDays', 'all');
    writeMetricsDaysPreference('activityDays', 14);
    writeMetricsDaysPreference('outboundDays', 90);
    expect(readMetricsDaysPreferences()).toEqual({
      completedDays: 'all',
      activityDays: 14,
      outboundDays: 90,
    });
    expect(store.get(METRICS_DAYS_PREF_KEY)).toContain('"completedDays":"all"');
  });

  it('persists every selection including histórico into the URL and localStorage', () => {
    installLocalStorage();
    const next = persistAndApplyMetricsDays(
      new URLSearchParams('tab=metrics'),
      'completedDays',
      'all',
    );
    expect(next.get('completedDays')).toBe('all');
    expect(readMetricsDaysPreferences().completedDays).toBe('all');
    const thirty = persistAndApplyMetricsDays(next, 'completedDays', 30);
    expect(thirty.get('completedDays')).toBe('30');
    expect(readMetricsDaysPreferences().completedDays).toBe(30);
  });

  it('maps temporal vistas to independent URL params', () => {
    expect(vistaDayParam('resumen')).toBe('completedDays');
    expect(vistaDayParam('app')).toBe('appDays');
    expect(vistaDayParam('mapa')).toBe('mapDays');
    expect(vistaDayParam('actividad')).toBe('activityDays');
    expect(vistaDayParam('outbound')).toBe('outboundDays');
    expect(vistaDayParam('calidad')).toBeNull();
    expect(vistaDayParam('friccion')).toBeNull();
  });

  it('treats days=all as the unbounded historic period', () => {
    expect(resolveMetricsDays(new URLSearchParams('days=all'))).toBe('all');
    expect(metricsPeriodRange('all')).toEqual({ from: null, to: null });
    expect(metricsPeriodLabel('all')).toBe('Histórico completo');
    expect(metricsPeriodLabel(30)).toBe('Últimos 30 días');
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

  it('persists days=all instead of treating it as a cleared filter', () => {
    const next = applyMetricsScope(new URLSearchParams('tab=metrics&status=COMPLETED'), {
      days: 'all',
      status: 'all',
    });
    expect(next.get('days')).toBe('all');
    expect(next.get('status')).toBeNull();
  });

  it('builds an inclusive UTC period for map queries', () => {
    expect(metricsPeriodRange(30, new Date('2026-09-07T16:00:00.000Z'))).toEqual({
      from: '2026-08-09',
      to: '2026-09-07',
    });
  });
});
