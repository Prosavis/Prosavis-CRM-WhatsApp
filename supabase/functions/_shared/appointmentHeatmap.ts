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

function usablePair(
  latitude: number | null,
  longitude: number | null,
): { lat: number; lng: number } | null {
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { lat: latitude, lng: longitude };
}

export function resolveHeatmapPoint(
  booking: HeatmapBookingInput,
  preferGps: boolean,
): { lat: number; lng: number; source: HeatmapPointSource } | null {
  const start = usablePair(
    finiteCoord(booking.startLatitude),
    finiteCoord(booking.startLongitude),
  );
  const address = usablePair(
    finiteCoord(booking.addressLatitude),
    finiteCoord(booking.addressLongitude),
  );
  if (preferGps && start) return { ...start, source: 'gps' };
  if (!preferGps && address) return { ...address, source: 'address' };
  if (preferGps && address) return null;
  if (start) return { ...start, source: 'gps' };
  return null;
}

export function coverageForBookings(bookings: HeatmapBookingInput[]): HeatmapCoverage {
  let withGps = 0;
  let withAddressOnly = 0;
  let withoutPoint = 0;
  for (const booking of bookings) {
    const hasGps = usablePair(
      finiteCoord(booking.startLatitude),
      finiteCoord(booking.startLongitude),
    ) != null;
    const hasAddress = usablePair(
      finiteCoord(booking.addressLatitude),
      finiteCoord(booking.addressLongitude),
    ) != null;
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
