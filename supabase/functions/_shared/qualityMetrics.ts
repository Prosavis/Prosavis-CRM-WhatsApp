/**
 * Agregados de calidad del núcleo COMPLETED (tags CRM + bookings).
 * Prioridad de capa: riesgo > favorito > recurrente > estándar.
 */

import {
  hasAgendadoTag,
  hasBloqueadoTag,
  hasDeclineTag,
  hasFavoritosTag,
  hasPararTag,
  hasProblematicaTag,
  isCompanyClient,
  isRecurringClient,
  isTestContact,
  qualityLayer,
  type QualityLayer,
} from './clientClassification.ts';

export type QualityPhoneKeyFn = (phone: string | null | undefined) => string | null;

export interface QualityDirectoryInput {
  id: string;
  name: string | null;
  phone: string | null;
  phoneKey: string | null;
  appUserId: string | null;
  classification: string | null;
  tags: string[];
}

export interface QualityBookingInput {
  appointmentId: string;
  status: string;
  paymentStatus: string | null;
  clientId: string | null;
  clientPhone: string | null;
  scheduledStart: string | null;
}

export interface QualityClientRow {
  id: string;
  name: string | null;
  phone: string | null;
  layer: QualityLayer;
  completedCount: number;
  canceledCount: number;
  tags: string[];
  isFavorite: boolean;
  isProblematica: boolean;
  isBloqueado: boolean;
  isDecline: boolean;
  isRecurringTag: boolean;
  isCompany: boolean;
  isAgendado: boolean;
  isParar: boolean;
}

export interface QualityTagCount {
  key: string;
  label: string;
  count: number;
  pct: number;
  ratio: number | null;
}

export interface QualityLayerCount {
  key: QualityLayer;
  label: string;
  count: number;
  pct: number;
}

export interface QualityCrossCancel {
  key: string;
  label: string;
  withCanceled: number;
  total: number;
}

export interface ClientQualityMetrics {
  nucleusSize: number;
  period: { from: string | null; to: string | null };
  tags: QualityTagCount[];
  layers: QualityLayerCount[];
  riskUnique: { count: number; pct: number; ratio: number | null };
  favoritesVsRest: {
    favorites: { n: number; avgCompleted: number; pctTwoPlus: number };
    rest: { n: number; avgCompleted: number; pctTwoPlus: number };
  };
  cancellations: {
    clientsWithCanceled: number;
    clientsWithCanceledPct: number;
    canceledBookings: number;
    pagoPendiente: number;
    pagoAceptado: number;
    pagoEnProceso: number;
  };
  crossCancel: QualityCrossCancel[];
  clients: QualityClientRow[];
}

const TAG_SPECS: Array<{
  key: string;
  label: string;
  pick: (row: QualityClientRow) => boolean;
}> = [
  { key: 'favoritos', label: 'Favoritos', pick: (row) => row.isFavorite },
  { key: 'problematica', label: 'Cliente Problemática', pick: (row) => row.isProblematica },
  { key: 'bloqueado', label: 'Bloqueado', pick: (row) => row.isBloqueado },
  { key: 'decline', label: 'Decline', pick: (row) => row.isDecline },
  { key: 'recurrente', label: 'Cliente recurrente', pick: (row) => row.isRecurringTag },
  { key: 'empresas', label: 'Empresas', pick: (row) => row.isCompany },
  { key: 'agendado', label: 'Agendado', pick: (row) => row.isAgendado },
  { key: 'parar', label: 'Parar', pick: (row) => row.isParar },
];

const LAYER_LABELS: Record<QualityLayer, string> = {
  favorite: 'Favorito (muy bueno)',
  recurring: 'Recurrente / sólido',
  standard: 'Estándar',
  risk: 'Riesgo / no próspero',
};

const CROSS_SPECS: Array<{
  key: string;
  label: string;
  pick: (row: QualityClientRow) => boolean;
}> = [
  { key: 'favoritos', label: 'Favoritos', pick: (row) => row.isFavorite },
  { key: 'problematica', label: 'Problemática', pick: (row) => row.isProblematica },
  { key: 'bloqueado', label: 'Bloqueado', pick: (row) => row.isBloqueado },
  { key: 'decline', label: 'Decline', pick: (row) => row.isDecline },
];

interface ClientBucket {
  completedCount: number;
  canceledCount: number;
  pagoPendiente: number;
  pagoAceptado: number;
  pagoEnProceso: number;
  samplePhone: string | null;
  sampleClientId: string | null;
}

function inPeriod(
  scheduledStart: string | null,
  fromIso: string | null | undefined,
  toIso: string | null | undefined,
): boolean {
  if (!fromIso && !toIso) return true;
  if (!scheduledStart) return false;
  if (fromIso && scheduledStart < fromIso) return false;
  if (toIso && scheduledStart > toIso) return false;
  return true;
}

function groupKey(
  booking: QualityBookingInput,
  phoneKey: QualityPhoneKeyFn,
): string | null {
  const pk = phoneKey(booking.clientPhone);
  if (pk) return `p:${pk}`;
  if (booking.clientId?.trim()) return `c:${booking.clientId.trim()}`;
  return null;
}

function directoryKeys(
  entry: QualityDirectoryInput,
  phoneKey: QualityPhoneKeyFn,
): string[] {
  const keys = new Set<string>();
  if (entry.phoneKey) keys.add(`p:${entry.phoneKey}`);
  const fromPhone = phoneKey(entry.phone);
  if (fromPhone) keys.add(`p:${fromPhone}`);
  if (entry.appUserId) keys.add(`c:${entry.appUserId}`);
  if (entry.id) keys.add(`c:${entry.id}`);
  return [...keys];
}

function ratioEvery(total: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round((total / count) * 10) / 10;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) / 10;
}

function twoPlusPct(values: number[]): number {
  if (values.length === 0) return 0;
  const hits = values.filter((n) => n >= 2).length;
  return Math.round((hits / values.length) * 1000) / 10;
}

export function buildQualityMetrics(params: {
  directory: QualityDirectoryInput[];
  bookings: QualityBookingInput[];
  phoneKey: QualityPhoneKeyFn;
  fromIso?: string | null;
  toIso?: string | null;
}): ClientQualityMetrics {
  const buckets = new Map<string, ClientBucket>();
  const ensure = (key: string): ClientBucket => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        completedCount: 0,
        canceledCount: 0,
        pagoPendiente: 0,
        pagoAceptado: 0,
        pagoEnProceso: 0,
        samplePhone: null,
        sampleClientId: null,
      };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const booking of params.bookings) {
    if (!inPeriod(booking.scheduledStart, params.fromIso, params.toIso)) continue;
    const key = groupKey(booking, params.phoneKey);
    if (!key) continue;
    const bucket = ensure(key);
    if (!bucket.samplePhone && booking.clientPhone) bucket.samplePhone = booking.clientPhone;
    if (!bucket.sampleClientId && booking.clientId) bucket.sampleClientId = booking.clientId;
    if (booking.status === 'COMPLETED') {
      bucket.completedCount += 1;
    }
    if (booking.status === 'CANCELED') {
      bucket.canceledCount += 1;
      if (booking.paymentStatus === 'PAGO_ACEPTADO') bucket.pagoAceptado += 1;
      else if (booking.paymentStatus === 'PAGO_EN_PROCESO') bucket.pagoEnProceso += 1;
      else bucket.pagoPendiente += 1;
    }
  }

  const usedBucketKeys = new Set<string>();
  const clients: QualityClientRow[] = [];

  for (const entry of params.directory) {
    const keys = directoryKeys(entry, params.phoneKey);
    if (isTestContact({ classification: entry.classification, tags: entry.tags })) {
      for (const key of keys) {
        if (buckets.has(key)) usedBucketKeys.add(key);
      }
      continue;
    }
    let completedCount = 0;
    let canceledCount = 0;
    for (const key of keys) {
      const bucket = buckets.get(key);
      if (!bucket) continue;
      if (bucket.completedCount > completedCount) {
        completedCount = bucket.completedCount;
        canceledCount = bucket.canceledCount;
      } else if (bucket.completedCount === completedCount && bucket.canceledCount > canceledCount) {
        canceledCount = bucket.canceledCount;
      }
    }
    if (completedCount < 1) continue;
    for (const key of keys) {
      if (buckets.has(key)) usedBucketKeys.add(key);
    }
    const classifiable = { classification: entry.classification, tags: entry.tags };
    clients.push({
      id: entry.id,
      name: entry.name,
      phone: entry.phone,
      layer: qualityLayer(classifiable, completedCount),
      completedCount,
      canceledCount,
      tags: entry.tags,
      isFavorite: hasFavoritosTag(classifiable),
      isProblematica: hasProblematicaTag(classifiable),
      isBloqueado: hasBloqueadoTag(classifiable),
      isDecline: hasDeclineTag(classifiable),
      isRecurringTag: isRecurringClient(classifiable),
      isCompany: isCompanyClient(classifiable),
      isAgendado: hasAgendadoTag(classifiable),
      isParar: hasPararTag(classifiable),
    });
  }

  let orphanIndex = 0;
  for (const [key, bucket] of buckets) {
    if (usedBucketKeys.has(key) || bucket.completedCount < 1) continue;
    orphanIndex += 1;
    const classifiable = { tags: [] as string[] };
    clients.push({
      id: `orphan:${key}`,
      name: null,
      phone: bucket.samplePhone,
      layer: qualityLayer(classifiable, bucket.completedCount),
      completedCount: bucket.completedCount,
      canceledCount: bucket.canceledCount,
      tags: [],
      isFavorite: false,
      isProblematica: false,
      isBloqueado: false,
      isDecline: false,
      isRecurringTag: false,
      isCompany: false,
      isAgendado: false,
      isParar: false,
    });
    if (orphanIndex > 10_000) break;
  }

  const nucleusSize = clients.length;
  const layerOrder: QualityLayer[] = ['favorite', 'recurring', 'standard', 'risk'];
  const layers = layerOrder.map((key) => {
    const count = clients.filter((row) => row.layer === key).length;
    return { key, label: LAYER_LABELS[key], count, pct: pct(count, nucleusSize) };
  });

  const tags = TAG_SPECS.map((spec) => {
    const count = clients.filter(spec.pick).length;
    return {
      key: spec.key,
      label: spec.label,
      count,
      pct: pct(count, nucleusSize),
      ratio: ratioEvery(nucleusSize, count),
    };
  });

  const riskCount = clients.filter((row) => row.layer === 'risk').length;
  const favorites = clients.filter((row) => row.layer === 'favorite');
  const rest = clients.filter((row) => row.layer !== 'favorite');

  const canceledBookings = clients.reduce((sum, row) => sum + row.canceledCount, 0);
  let pagoPendiente = 0;
  let pagoAceptado = 0;
  let pagoEnProceso = 0;
  for (const [key, bucket] of buckets) {
    const used = usedBucketKeys.has(key) ||
      clients.some((row) => row.id === `orphan:${key}`);
    if (!used || bucket.completedCount < 1) continue;
    pagoPendiente += bucket.pagoPendiente;
    pagoAceptado += bucket.pagoAceptado;
    pagoEnProceso += bucket.pagoEnProceso;
  }

  const clientsWithCanceled = clients.filter((row) => row.canceledCount > 0).length;

  return {
    nucleusSize,
    period: { from: params.fromIso ?? null, to: params.toIso ?? null },
    tags,
    layers,
    riskUnique: {
      count: riskCount,
      pct: pct(riskCount, nucleusSize),
      ratio: ratioEvery(nucleusSize, riskCount),
    },
    favoritesVsRest: {
      favorites: {
        n: favorites.length,
        avgCompleted: avg(favorites.map((row) => row.completedCount)),
        pctTwoPlus: twoPlusPct(favorites.map((row) => row.completedCount)),
      },
      rest: {
        n: rest.length,
        avgCompleted: avg(rest.map((row) => row.completedCount)),
        pctTwoPlus: twoPlusPct(rest.map((row) => row.completedCount)),
      },
    },
    cancellations: {
      clientsWithCanceled,
      clientsWithCanceledPct: pct(clientsWithCanceled, nucleusSize),
      canceledBookings,
      pagoPendiente,
      pagoAceptado,
      pagoEnProceso,
    },
    crossCancel: CROSS_SPECS.map((spec) => {
      const subset = clients.filter(spec.pick);
      return {
        key: spec.key,
        label: spec.label,
        withCanceled: subset.filter((row) => row.canceledCount > 0).length,
        total: subset.length,
      };
    }),
    clients,
  };
}
