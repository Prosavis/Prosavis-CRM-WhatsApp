export const METRICS_VISTA_KEYS = [
  'mapa',
  'calidad',
  'friccion',
  'clientes',
  'actividad',
  'outbound',
] as const;

export type MetricsVista = (typeof METRICS_VISTA_KEYS)[number];

const VISTA_SET = new Set<string>(METRICS_VISTA_KEYS);
const METRICS_DAY_OPTIONS = new Set([7, 14, 30, 60, 90]);

export function isMetricsVista(value: string | null | undefined): value is MetricsVista {
  return Boolean(value && VISTA_SET.has(value));
}

export function resolveMetricsVista(search: URLSearchParams): MetricsVista {
  const raw = search.get('vista');
  return isMetricsVista(raw) ? raw : 'calidad';
}

export function applyMetricsVista(
  search: URLSearchParams,
  vista: MetricsVista,
): URLSearchParams {
  const next = new URLSearchParams(search);
  next.set('tab', 'metrics');
  if (vista === 'calidad') next.delete('vista');
  else next.set('vista', vista);
  return next;
}

export function resolveMetricsDays(search: URLSearchParams): number {
  const parsed = Number.parseInt(search.get('days') ?? '', 10);
  return METRICS_DAY_OPTIONS.has(parsed) ? parsed : 30;
}

export function applyMetricsScope(
  search: URLSearchParams,
  updates: Record<string, string | null | undefined>,
): URLSearchParams {
  const next = new URLSearchParams(search);
  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === '' || value === 'all') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }
  return next;
}

export function metricsPeriodRange(
  days: number,
  now = new Date(),
): { from: string; to: string } {
  const end = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(0, days - 1));
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}
