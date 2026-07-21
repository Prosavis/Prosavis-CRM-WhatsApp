import type { ReactivationHistoryRun } from '@/types/reactivationAutomations';

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

export function formatRunDateTitle(runDate: string): string {
  const d = new Date(`${runDate}T12:00:00`);
  const formatted = d.toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Bogota',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function formatRunTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

export function groupRunsByDate(runs: ReactivationHistoryRun[]): Array<{
  runDate: string;
  runsAsc: ReactivationHistoryRun[];
}> {
  const map = new Map<string, ReactivationHistoryRun[]>();
  for (const run of [...runs].sort((a, b) => a.run_at.localeCompare(b.run_at))) {
    const list = map.get(run.run_date) ?? [];
    list.push(run);
    map.set(run.run_date, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([runDate, runsAsc]) => ({ runDate, runsAsc }));
}

export function getDayHealth(runsAsc: ReactivationHistoryRun[]): {
  sent: number;
  failed: number;
  dryRun: number;
  skipped: number;
  status: 'ok' | 'partial' | 'failed' | 'empty' | 'dry';
  statusLabel: string;
} {
  if (runsAsc.length === 0) {
    return { sent: 0, failed: 0, dryRun: 0, skipped: 0, status: 'empty', statusLabel: 'Sin datos' };
  }

  const sent = runsAsc.reduce((sum, r) => sum + (r.execution_stats.sent ?? 0), 0);
  const failed = runsAsc.reduce((sum, r) => sum + (r.execution_stats.failed ?? 0), 0);
  const dryRun = runsAsc.reduce((sum, r) => sum + (r.execution_stats.dryRun ?? 0), 0);
  const skipped = runsAsc.reduce((sum, r) => sum + (r.execution_stats.skipped ?? 0), 0);
  const allDry = runsAsc.every((r) => r.dry_run);

  if (allDry && dryRun > 0) {
    return { sent, failed, dryRun, skipped, status: 'dry', statusLabel: 'Solo simulación' };
  }
  if (failed > 0 && sent === 0) {
    return { sent, failed, dryRun, skipped, status: 'failed', statusLabel: 'Con fallos' };
  }
  if (failed > 0) {
    return { sent, failed, dryRun, skipped, status: 'partial', statusLabel: 'Parcial' };
  }
  if (sent > 0) {
    return { sent, failed, dryRun, skipped, status: 'ok', statusLabel: 'Completado' };
  }
  return { sent, failed, dryRun, skipped, status: 'empty', statusLabel: 'Sin envíos' };
}
