import type { ExecutionStats, HistoryBatchRun } from '@/types/reminderAutomations';

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function defaultHistoryDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

export function shiftIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** Fecha de servicio en lenguaje natural (es-CO). */
export function formatServiceDateTitle(serviceDate: string): string {
  const d = new Date(`${serviceDate}T12:00:00`);
  const formatted = d.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Bogota',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatServiceDateShort(serviceDate: string): string {
  const d = new Date(`${serviceDate}T12:00:00`);
  return d.toLocaleDateString('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Bogota',
  });
}

export function formatRunTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

export function formatRunWeekdayTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

export function runKindTitle(kind: HistoryBatchRun['runKind']): string {
  if (kind === 'primary') return 'Envío principal';
  if (kind === 'manual') return 'Envío manual';
  return 'Reintento';
}

export function runKindSubtitle(kind: HistoryBatchRun['runKind']): string {
  if (kind === 'primary') return 'Corrida automática de las 6:00 p. m.';
  if (kind === 'manual') return 'Disparado desde el panel';
  return 'Segundo intento para completar pendientes';
}

export function totalSkipped(stats: ExecutionStats): number {
  return (
    stats.skippedAlreadySent +
    stats.skippedDisabled +
    stats.skippedMissingPhone +
    stats.skippedMissingProfessional +
    stats.skippedMaxAttempts
  );
}

export interface SkipBreakdownItem {
  key: string;
  label: string;
  count: number;
  hint: string;
}

export function getSkipBreakdown(stats: ExecutionStats): SkipBreakdownItem[] {
  const items: SkipBreakdownItem[] = [
    {
      key: 'already',
      label: 'Ya enviados',
      count: stats.skippedAlreadySent,
      hint: 'No se reenvió porque ya tenían recordatorio',
    },
    {
      key: 'disabled',
      label: 'Desactivados',
      count: stats.skippedDisabled,
      hint: 'Recordatorios apagados para ese contacto',
    },
    {
      key: 'phone',
      label: 'Sin teléfono',
      count: stats.skippedMissingPhone,
      hint: 'Falta un número válido de WhatsApp',
    },
    {
      key: 'pro',
      label: 'Sin cleaner',
      count: stats.skippedMissingProfessional,
      hint: 'La cita no tiene profesional asignado',
    },
    {
      key: 'max',
      label: 'Límite de intentos',
      count: stats.skippedMaxAttempts,
      hint: 'Se alcanzó el máximo de reintentos',
    },
  ];
  return items.filter((item) => item.count > 0);
}

export interface DayHealth {
  /** Total de mensajes enviados con éxito en el día (suma de todas las corridas). */
  sent: number;
  /** Fallos que quedaron al cierre (última corrida). */
  failed: number;
  /** Omitidos reales al cierre (sin contar “ya enviados” de reintentos). */
  skipped: number;
  attempted: number;
  /** Desglose de enviados por corrida, p. ej. "10 en el principal + 2 en reintentos". */
  sentBreakdown: string | null;
  status: 'ok' | 'partial' | 'failed' | 'empty';
  statusLabel: string;
}

/**
 * Resumen del día:
 * - enviados = suma de todas las corridas (lo que realmente salió)
 * - fallidos / omitidos = estado al cierre (última corrida), omitidos sin “ya enviados”
 */
export function getDayHealth(runsAsc: HistoryBatchRun[]): DayHealth {
  if (runsAsc.length === 0) {
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      attempted: 0,
      sentBreakdown: null,
      status: 'empty',
      statusLabel: 'Sin datos',
    };
  }

  const sent = runsAsc.reduce((sum, run) => sum + run.executionStats.sent, 0);
  const attempted = runsAsc.reduce((sum, run) => sum + run.executionStats.attempted, 0);
  const last = runsAsc[runsAsc.length - 1];
  const failed = last.executionStats.failed;
  // En reintentos, “ya enviados” infla omitidos; el resumen del día solo cuenta omisiones reales.
  const skipped =
    last.executionStats.skippedDisabled +
    last.executionStats.skippedMissingPhone +
    last.executionStats.skippedMissingProfessional +
    last.executionStats.skippedMaxAttempts;

  const primarySent = runsAsc
    .filter((r) => r.runKind === 'primary')
    .reduce((sum, r) => sum + r.executionStats.sent, 0);
  const retrySent = runsAsc
    .filter((r) => r.runKind !== 'primary')
    .reduce((sum, r) => sum + r.executionStats.sent, 0);

  let sentBreakdown: string | null = null;
  if (sent > 0 && runsAsc.length > 1 && retrySent > 0) {
    const parts: string[] = [];
    if (primarySent > 0) parts.push(`${primarySent} en el principal`);
    if (retrySent > 0) parts.push(`${retrySent} en reintentos`);
    sentBreakdown = parts.join(' + ');
  }

  let status: DayHealth['status'] = 'empty';
  let statusLabel = 'Sin envíos';
  if (failed > 0 && sent === 0) {
    status = 'failed';
    statusLabel = 'Con fallos';
  } else if (failed > 0) {
    status = 'partial';
    statusLabel = 'Parcial';
  } else if (sent > 0) {
    status = 'ok';
    statusLabel = 'Completado';
  } else if (skipped > 0) {
    status = 'empty';
    statusLabel = 'Sin envíos';
  }

  return {
    sent,
    failed,
    skipped,
    attempted,
    sentBreakdown,
    status,
    statusLabel,
  };
}

/**
 * Nota contextual vs la corrida anterior.
 * `executionStats` es por corrida (no acumulado): un reintento con menos
 * "enviados" es normal, no un retroceso.
 */
export function formatFriendlyDelta(
  prev: HistoryBatchRun | undefined,
  curr: HistoryBatchRun,
): string | null {
  if (!prev) return null;
  const b = curr.executionStats;

  if (curr.runKind === 'retry' || curr.runKind === 'manual') {
    if (b.sent > 0 && b.failed === 0) {
      return `Completó ${b.sent} envío${b.sent === 1 ? '' : 's'} pendiente${b.sent === 1 ? '' : 's'}`;
    }
    if (b.sent > 0 && b.failed > 0) {
      return `Avanzó ${b.sent} · aún ${b.failed} con error`;
    }
    if (b.sent === 0 && b.failed > 0) {
      return `No pudo completar ${b.failed} pendiente${b.failed === 1 ? '' : 's'}`;
    }
    if (b.sent === 0 && totalSkipped(b) > 0) {
      return 'Nada nuevo por enviar (ya cubiertos u omitidos)';
    }
    return null;
  }

  return null;
}

export function groupRunsByServiceDate(runs: HistoryBatchRun[]): Array<{
  serviceDate: string;
  runsAsc: HistoryBatchRun[];
}> {
  const map = new Map<string, HistoryBatchRun[]>();
  for (const run of [...runs].sort((a, b) => a.runAt.localeCompare(b.runAt))) {
    const list = map.get(run.serviceDate) ?? [];
    list.push(run);
    map.set(run.serviceDate, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([serviceDate, runsAsc]) => ({ serviceDate, runsAsc }));
}
