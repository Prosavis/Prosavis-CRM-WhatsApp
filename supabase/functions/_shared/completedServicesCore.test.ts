import { assertEquals } from 'jsr:@std/assert';
import { resolveRequestedServiceId } from './fetchAllRows.ts';
import {
  appointmentTotalCop,
  bogotaDayKey,
  buildCompletedServicesCore,
  monthKeyFromDay,
  sumLifetimeCollected,
  weekKeyFromDay,
} from './completedServicesCore.ts';

const TODAY = '2026-09-16';
const WINDOW_FROM = '2026-03-16T05:00:00.000Z';
const WINDOW_TO = '2026-09-16T05:00:00.000Z';

Deno.test('bogotaDayKey agrupa en UTC-5', () => {
  assertEquals(bogotaDayKey('2026-09-16T04:30:00.000Z'), '2026-09-15');
  assertEquals(bogotaDayKey('2026-09-16T05:00:00.000Z'), '2026-09-16');
});

Deno.test('series COMPLETED día/semana/mes con lentes comparativas', () => {
  const scheduledIsos = [
    '2026-09-16T15:00:00-05:00',
    '2026-09-15T10:00:00-05:00',
    '2026-08-16T10:00:00-05:00',
    '2026-07-16T10:00:00-05:00',
    '2026-06-01T10:00:00-05:00',
  ];

  const result = buildCompletedServicesCore({
    scheduledIsos,
    windowFromIso: WINDOW_FROM,
    windowToIso: WINDOW_TO,
    periodStartKey: '2026-08-18',
    periodEndKey: TODAY,
  });

  assertEquals(
    result.timeseries.day.map((point) => point.bucket),
    ['2026-06-01', '2026-07-16', '2026-08-16', '2026-09-15', '2026-09-16'],
  );
  assertEquals(
    result.timeseries.day.map((point) => point.completed),
    [1, 1, 1, 1, 1],
  );

  const septemberWeek = weekKeyFromDay('2026-09-16');
  const septemberMonth = monthKeyFromDay('2026-09-16');
  assertEquals(
    result.timeseries.week.find((point) => point.bucket === septemberWeek)?.completed,
    2,
  );
  assertEquals(
    result.timeseries.month.find((point) => point.bucket === septemberMonth)?.completed,
    2,
  );

  assertEquals(result.meta.totalCompleted, 5);
  assertEquals(result.meta.inSelectedPeriod, 2);
  assertEquals(result.meta.lastCompletedDate, TODAY);
  assertEquals(result.meta.today, TODAY);
  assertEquals(result.meta.currentMonth, '2026-09');
  assertEquals(result.meta.comparisons.mtd, {
    current: 2,
    previous: 1,
    growth: 100,
  });
  assertEquals(result.meta.comparisons.rolling30d, {
    current: 2,
    previous: 1,
    growth: 100,
  });
  assertEquals(result.meta.comparisons.lastClosedMonth?.month, '2026-08');
  assertEquals(result.meta.comparisons.lastClosedMonth?.current, 1);
  assertEquals(result.meta.comparisons.lastClosedMonth?.previous, 1);
  assertEquals(result.meta.comparisons.lastClosedMonth?.growth, 0);
});

Deno.test('ingresos históricos solo suman PAGO_ACEPTADO con el total real', () => {
  const result = sumLifetimeCollected([
    { paymentStatus: 'PAGO_ACEPTADO', totalAmount: 80000 },
    {
      paymentStatus: 'PAGO_ACEPTADO',
      price: 50000,
      bookingSnapshot: { totalAmount: 45000 },
    },
    { paymentStatus: 'PAGO_PENDIENTE', totalAmount: 90000 },
  ]);
  assertEquals(result.lifetimePaidAppointmentCount, 2);
  assertEquals(result.lifetimeCollectedTotal, 130000);
  assertEquals(appointmentTotalCop({ price: 10, bookingSnapshot: { totalAmount: 99 } }), 10);
});

Deno.test('serviceId explícito gana sobre el fallback del entorno', () => {
  const previous = Deno.env.get('PROSAVIS_SERVICE_ID');
  Deno.env.set('PROSAVIS_SERVICE_ID', 'env-service');
  try {
    assertEquals(resolveRequestedServiceId('explicit-service'), 'explicit-service');
    assertEquals(resolveRequestedServiceId('  '), 'env-service');
    assertEquals(resolveRequestedServiceId(undefined), 'env-service');
  } finally {
    if (previous == null) Deno.env.delete('PROSAVIS_SERVICE_ID');
    else Deno.env.set('PROSAVIS_SERVICE_ID', previous);
  }
});
