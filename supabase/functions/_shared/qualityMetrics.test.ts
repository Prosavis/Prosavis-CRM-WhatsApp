import { assertEquals } from 'jsr:@std/assert';
import { buildQualityMetrics } from './qualityMetrics.ts';

const phoneKey = (phone: string | null | undefined) => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-10) || null;
};

Deno.test('buildQualityMetrics builds COMPLETED nucleus layers and unique risk', () => {
  const metrics = buildQualityMetrics({
    phoneKey,
    directory: [
      {
        id: 'lilian',
        name: 'Lilian',
        phone: '3001111111',
        phoneKey: '3001111111',
        appUserId: null,
        classification: null,
        tags: ['Bloqueado', 'Cliente Problemática'],
      },
      {
        id: 'canela',
        name: 'Canela Obando',
        phone: '3002222222',
        phoneKey: '3002222222',
        appUserId: null,
        classification: null,
        tags: ['Favoritos'],
      },
      {
        id: 'first',
        name: 'Primera',
        phone: '3003333333',
        phoneKey: '3003333333',
        appUserId: null,
        classification: null,
        tags: ['Agendado'],
      },
      {
        id: 'test',
        name: 'QA',
        phone: '3004444444',
        phoneKey: '3004444444',
        appUserId: null,
        classification: null,
        tags: ['TEST'],
      },
    ],
    bookings: [
      {
        appointmentId: 'a1',
        status: 'COMPLETED',
        paymentStatus: 'PAGO_ACEPTADO',
        clientId: 'lilian',
        clientPhone: '3001111111',
        scheduledStart: '2026-08-01T10:00:00.000Z',
      },
      {
        appointmentId: 'a2',
        status: 'CANCELED',
        paymentStatus: 'PAGO_PENDIENTE',
        clientId: 'lilian',
        clientPhone: '3001111111',
        scheduledStart: '2026-08-02T10:00:00.000Z',
      },
      {
        appointmentId: 'a3',
        status: 'COMPLETED',
        paymentStatus: 'PAGO_ACEPTADO',
        clientId: 'canela',
        clientPhone: '3002222222',
        scheduledStart: '2026-08-01T10:00:00.000Z',
      },
      {
        appointmentId: 'a4',
        status: 'COMPLETED',
        paymentStatus: 'PAGO_ACEPTADO',
        clientId: 'canela',
        clientPhone: '3002222222',
        scheduledStart: '2026-08-08T10:00:00.000Z',
      },
      {
        appointmentId: 'a5',
        status: 'COMPLETED',
        paymentStatus: 'PAGO_ACEPTADO',
        clientId: 'first',
        clientPhone: '3003333333',
        scheduledStart: '2026-08-01T10:00:00.000Z',
      },
      {
        appointmentId: 'a6',
        status: 'COMPLETED',
        paymentStatus: 'PAGO_ACEPTADO',
        clientId: 'test',
        clientPhone: '3004444444',
        scheduledStart: '2026-08-01T10:00:00.000Z',
      },
    ],
  });

  assertEquals(metrics.nucleusSize, 3);
  assertEquals(metrics.layers.find((layer) => layer.key === 'risk')?.count, 1);
  assertEquals(metrics.layers.find((layer) => layer.key === 'favorite')?.count, 1);
  assertEquals(metrics.layers.find((layer) => layer.key === 'standard')?.count, 1);
  assertEquals(metrics.riskUnique.count, 1);
  assertEquals(metrics.favoritesVsRest.favorites.avgCompleted, 2);
  assertEquals(metrics.favoritesVsRest.favorites.pctTwoPlus, 100);
  assertEquals(metrics.cancellations.clientsWithCanceled, 1);
  assertEquals(metrics.cancellations.canceledBookings, 1);
  assertEquals(metrics.cancellations.pagoPendiente, 1);
  assertEquals(
    metrics.crossCancel.find((row) => row.key === 'problematica'),
    { key: 'problematica', label: 'Problemática', withCanceled: 1, total: 1 },
  );
});

Deno.test('buildQualityMetrics does not treat Decline CRM as a canceled booking', () => {
  const metrics = buildQualityMetrics({
    phoneKey,
    directory: [
      {
        id: 'carmen',
        name: 'Carmen',
        phone: '3005555555',
        phoneKey: '3005555555',
        appUserId: null,
        classification: null,
        tags: ['Decline'],
      },
    ],
    bookings: [
      {
        appointmentId: 'c1',
        status: 'COMPLETED',
        paymentStatus: 'PAGO_ACEPTADO',
        clientId: 'carmen',
        clientPhone: '3005555555',
        scheduledStart: '2026-08-21T10:00:00.000Z',
      },
    ],
  });

  assertEquals(metrics.tags.find((tag) => tag.key === 'decline')?.count, 1);
  assertEquals(metrics.cancellations.canceledBookings, 0);
  assertEquals(
    metrics.crossCancel.find((row) => row.key === 'decline')?.withCanceled,
    0,
  );
});
