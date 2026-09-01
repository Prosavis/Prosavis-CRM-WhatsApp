import { assertEquals } from 'jsr:@std/assert';
import { resolveReminderDashboardWindows } from './reminderDashboardWindows.ts';

Deno.test('antes de las 18:00, próximo es mañana y último es hoy', () => {
  const meta = resolveReminderDashboardWindows(new Date('2026-09-01T22:59:00.000Z'));
  assertEquals(meta.beforeNextSchedulerRun, true);
  assertEquals(meta.upcomingServiceDate, '2026-09-02');
  assertEquals(meta.lastRunServiceDate, '2026-09-01');
  assertEquals(meta.nextSchedulerRunAt, '2026-09-01T23:00:00.000Z');
  assertEquals(meta.lastSchedulerRunAt, '2026-08-31T23:00:00.000Z');
  assertEquals(meta.lastBatchRunAt, '2026-08-31T23:00:00.000Z');
});

Deno.test('después de las 18:00, último es el lote que acaba de salir', () => {
  const meta = resolveReminderDashboardWindows(new Date('2026-09-01T23:05:00.000Z'));
  assertEquals(meta.beforeNextSchedulerRun, false);
  assertEquals(meta.upcomingServiceDate, '2026-09-03');
  assertEquals(meta.lastRunServiceDate, '2026-09-02');
  assertEquals(meta.nextSchedulerRunAt, '2026-09-02T23:00:00.000Z');
  assertEquals(meta.lastSchedulerRunAt, '2026-09-01T23:00:00.000Z');
  assertEquals(meta.lastBatchRunAt, '2026-09-01T23:00:00.000Z');
});
