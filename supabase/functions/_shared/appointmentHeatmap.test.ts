import { assertEquals } from 'jsr:@std/assert';
import {
  buildAppointmentHeatmap,
  coverageForBookings,
  resolveHeatmapPoint,
} from './appointmentHeatmap.ts';

const booking = {
  appointmentId: 'apt-1',
  status: 'COMPLETED',
  scheduledStart: '2026-08-01T15:00:00.000Z',
  startLatitude: 4.813,
  startLongitude: -75.696,
  addressLatitude: 4.8143,
  addressLongitude: -75.6946,
  clientPhone: '3001111111',
  clientId: 'dir-1',
};

Deno.test('resolveHeatmapPoint prefers GPS start when asked', () => {
  const point = resolveHeatmapPoint(booking, true);
  assertEquals(point, { lat: 4.813, lng: -75.696, source: 'gps' });
});

Deno.test('resolveHeatmapPoint uses address only when GPS mode is off', () => {
  const point = resolveHeatmapPoint(booking, false);
  assertEquals(point, { lat: 4.8143, lng: -75.6946, source: 'address' });
});

Deno.test('resolveHeatmapPoint does not silently fall back to address in GPS mode', () => {
  const point = resolveHeatmapPoint(
    { ...booking, startLatitude: null, startLongitude: null },
    true,
  );
  assertEquals(point, null);
});

Deno.test('coverageForBookings splits GPS, address-only and missing', () => {
  const coverage = coverageForBookings([
    booking,
    { ...booking, appointmentId: 'apt-2', startLatitude: null, startLongitude: null },
    {
      ...booking,
      appointmentId: 'apt-3',
      startLatitude: null,
      startLongitude: null,
      addressLatitude: null,
      addressLongitude: null,
    },
  ]);
  assertEquals(coverage, {
    total: 3,
    withGps: 1,
    withAddressOnly: 1,
    withoutPoint: 1,
  });
});

Deno.test('buildAppointmentHeatmap keeps city centroids out of GPS mode', () => {
  const result = buildAppointmentHeatmap({
    preferGps: true,
    layerByAppointment: new Map([['apt-1', 'favorite']]),
    bookings: [
      booking,
      {
        ...booking,
        appointmentId: 'city-only',
        startLatitude: null,
        startLongitude: null,
        addressLatitude: 4.8133,
        addressLongitude: -75.6961,
      },
    ],
  });
  assertEquals(result.points.length, 1);
  assertEquals(result.points[0]?.id, 'apt-1');
  assertEquals(result.points[0]?.layer, 'favorite');
  assertEquals(result.coverage.withAddressOnly, 1);
});
