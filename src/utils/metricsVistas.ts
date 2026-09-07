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
