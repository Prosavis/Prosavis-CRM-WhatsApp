export const METRICS_VISTA_KEYS = [
  'resumen',
  'app',
  'mapa',
  'calidad',
  'friccion',
  'clientes',
  'actividad',
  'outbound',
] as const;

export type MetricsVista = (typeof METRICS_VISTA_KEYS)[number];

export type MetricsDays = number | 'all';

export const METRICS_VIEW_DAY_PARAMS = {
  completedDays: 'completedDays',
  mapDays: 'mapDays',
  activityDays: 'activityDays',
  outboundDays: 'outboundDays',
  appDays: 'appDays',
} as const;

export type MetricsViewDayParam = (typeof METRICS_VIEW_DAY_PARAMS)[keyof typeof METRICS_VIEW_DAY_PARAMS];

const VISTA_SET = new Set<string>(METRICS_VISTA_KEYS);
const METRICS_DAY_OPTIONS = new Set([7, 14, 30, 60, 90]);
const METRICS_VIEW_DAY_PARAM_SET = new Set<string>(Object.values(METRICS_VIEW_DAY_PARAMS));

export const METRICS_DAYS_PREF_KEY = 'prosavis.metrics.days.v1';

export type MetricsDaysPreferences = Partial<Record<MetricsViewDayParam, MetricsDays>>;

type MetricsDaysStorage = Pick<Storage, 'getItem' | 'setItem'>;

function metricsDaysStorage(): MetricsDaysStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function parseMetricsDaysValue(raw: string | null | undefined): MetricsDays | null {
  if (raw === 'all') return 'all';
  const parsed = Number.parseInt(raw ?? '', 10);
  return METRICS_DAY_OPTIONS.has(parsed) ? parsed : null;
}

export function readMetricsDaysPreferences(
  storage: Pick<Storage, 'getItem'> | null = metricsDaysStorage(),
): MetricsDaysPreferences {
  if (!storage) return {};
  try {
    const raw = storage.getItem(METRICS_DAYS_PREF_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: MetricsDaysPreferences = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!METRICS_VIEW_DAY_PARAM_SET.has(key)) continue;
      const days = parseMetricsDaysValue(value == null ? null : String(value));
      if (days != null) out[key as MetricsViewDayParam] = days;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeMetricsDaysPreference(
  param: MetricsViewDayParam,
  days: MetricsDays,
  storage: MetricsDaysStorage | null = metricsDaysStorage(),
): void {
  if (!storage) return;
  try {
    const current = readMetricsDaysPreferences(storage);
    current[param] = days;
    storage.setItem(METRICS_DAYS_PREF_KEY, JSON.stringify(current));
  } catch {
    // localStorage puede estar bloqueado
  }
}

export function isMetricsVista(value: string | null | undefined): value is MetricsVista {
  return Boolean(value && VISTA_SET.has(value));
}

export function resolveMetricsVista(search: URLSearchParams): MetricsVista {
  const raw = search.get('vista');
  return isMetricsVista(raw) ? raw : 'resumen';
}

export function applyMetricsVista(
  search: URLSearchParams,
  vista: MetricsVista,
): URLSearchParams {
  const next = new URLSearchParams(search);
  next.set('tab', 'metrics');
  if (vista === 'resumen') next.delete('vista');
  else next.set('vista', vista);
  return next;
}

export function resolveMetricsDays(
  search: URLSearchParams,
  param: MetricsViewDayParam | 'days' = 'days',
  stored: MetricsDays | null = null,
): MetricsDays {
  const fromUrl = parseMetricsDaysValue(search.get(param));
  if (fromUrl != null) return fromUrl;
  if (stored === 'all' || (typeof stored === 'number' && METRICS_DAY_OPTIONS.has(stored))) {
    return stored;
  }
  return 'all';
}

export function persistAndApplyMetricsDays(
  search: URLSearchParams,
  param: MetricsViewDayParam,
  days: MetricsDays,
): URLSearchParams {
  writeMetricsDaysPreference(param, days);
  return applyMetricsScope(search, { [param]: String(days) });
}

export function applyMetricsScope(
  search: URLSearchParams,
  updates: Record<string, string | null | undefined>,
): URLSearchParams {
  const next = new URLSearchParams(search);
  for (const [key, value] of Object.entries(updates)) {
    if ((key === 'days' || key.endsWith('Days')) && value === 'all') {
      next.set(key, 'all');
      continue;
    }
    if (value == null || value === '' || value === 'all') {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  }
  return next;
}

export function metricsPeriodRange(
  days: MetricsDays,
  now = new Date(),
): { from: string | null; to: string | null } {
  if (days === 'all') return { from: null, to: null };
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

export function metricsPeriodLabel(days: MetricsDays): string {
  return days === 'all' ? 'Histórico completo' : `Últimos ${days} días`;
}

export function metricsPeriodPhrase(days: MetricsDays): string {
  return days === 'all' ? 'el histórico completo' : `los últimos ${days} días`;
}

export function vistaDayParam(vista: MetricsVista): MetricsViewDayParam | null {
  switch (vista) {
    case 'resumen':
      return 'completedDays';
    case 'mapa':
      return 'mapDays';
    case 'actividad':
      return 'activityDays';
    case 'outbound':
      return 'outboundDays';
    case 'app':
      return 'appDays';
    case 'calidad':
    case 'friccion':
    case 'clientes':
      return null;
    default: {
      const _never: never = vista;
      return _never;
    }
  }
}
