import type { QualityLayer } from './clientClassification.ts';
import { qualityLayer } from './clientClassification.ts';

export type HeatmapPointSource = 'gps' | 'address';

export interface HeatmapBookingInput {
  appointmentId: string;
  status: string;
  scheduledStart: string | null;
  startLatitude: number | null;
  startLongitude: number | null;
  addressLatitude: number | null;
  addressLongitude: number | null;
  clientPhone: string | null;
  clientId: string | null;
}

export interface HeatmapDirectoryInput {
  id: string;
  phoneKey: string | null;
  phone: string | null;
  appUserId: string | null;
  classification: string | null;
  tags: string[];
  completedCount: number;
}

export interface HeatmapPoint {
  id: string;
  lat: number;
  lng: number;
  source: HeatmapPointSource;
  layer: QualityLayer;
  status: string;
  scheduledStart: string | null;
}

export interface HeatmapCoverage {
  total: number;
  withGps: number;
  withAddressOnly: number;
  withoutPoint: number;
}

export interface AppointmentHeatmapResult {
  points: HeatmapPoint[];
  coverage: HeatmapCoverage;
}

function finiteCoord(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export function resolveHeatmapPoint(
  booking: HeatmapBookingInput,
  preferGps: boolean,
): { lat: number; lng: number; source: HeatmapPointSource } | null {
  const startLat = finiteCoord(booking.startLatitude);
  const startLng = finiteCoord(booking.startLongitude);
  const addrLat = finiteCoord(booking.addressLatitude);
  const addrLng = finiteCoord(booking.addressLongitude);
  if (preferGps && startLat != null && startLng != null) {
    return { lat: startLat, lng: startLng, source: 'gps' };
  }
  if (!preferGps && addrLat != null && addrLng != null) {
    return { lat: addrLat, lng: addrLng, source: 'address' };
  }
  if (preferGps && addrLat != null && addrLng != null) {
    return null;
  }
  if (startLat != null && startLng != null) {
    return { lat: startLat, lng: startLng, source: 'gps' };
  }
  return null;
}

export function coverageForBookings(bookings: HeatmapBookingInput[]): HeatmapCoverage {
  let withGps = 0;
  let withAddressOnly = 0;
  let withoutPoint = 0;
  for (const booking of bookings) {
    const hasGps =
      finiteCoord(booking.startLatitude) != null &&
      finiteCoord(booking.startLongitude) != null;
    const hasAddress =
      finiteCoord(booking.addressLatitude) != null &&
      finiteCoord(booking.addressLongitude) != null;
    if (hasGps) withGps += 1;
    else if (hasAddress) withAddressOnly += 1;
    else withoutPoint += 1;
  }
  return {
    total: bookings.length,
    withGps,
    withAddressOnly,
    withoutPoint,
  };
}

export function buildAppointmentHeatmap(params: {
  bookings: HeatmapBookingInput[];
  layerByAppointment: Map<string, QualityLayer>;
  preferGps: boolean;
}): AppointmentHeatmapResult {
  const points: HeatmapPoint[] = [];
  for (const booking of params.bookings) {
    const resolved = resolveHeatmapPoint(booking, params.preferGps);
    if (!resolved) continue;
    points.push({
      id: booking.appointmentId,
      lat: resolved.lat,
      lng: resolved.lng,
      source: resolved.source,
      layer: params.layerByAppointment.get(booking.appointmentId) ?? 'standard',
      status: booking.status,
      scheduledStart: booking.scheduledStart,
    });
  }
  return {
    points,
    coverage: coverageForBookings(params.bookings),
  };
}

export function layerForDirectory(
  entry: HeatmapDirectoryInput,
): QualityLayer {
  return qualityLayer(
    { classification: entry.classification, tags: entry.tags },
    entry.completedCount,
  );
}
