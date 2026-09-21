export type VisitQuality = "bad" | "standard" | "good" | "unknown";
export type GeoQuality = "exact" | "approximate" | "missing" | "ambiguous";
export type VisitNeed = "required_complaint" | "recommended" | "optional" | "none";
export type VisitUrgency = "critical" | "high" | "medium" | "low";
export const RECENT_SERVICE_DAYS = 7;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface VisitCandidate {
  clientReference: string;
  displayName: string;
  quality: VisitQuality;
  lifetimeValueCop: number;
  riskScore: number;
  openComplaint: boolean;
  optOut: boolean;
  lastVisitAt: string | null;
  latitude: number | null;
  longitude: number | null;
  geoQuality?: GeoQuality;
  visitNeed?: VisitNeed;
  visitReasons?: string[];
  directoryId?: string | null;
  addressLine?: string | null;
  pendingReply?: boolean;
  recentServiceAt?: string | null;
  urgency?: VisitUrgency;
  grokDecision?: {
    includeInRoute: boolean;
    rank?: number;
    urgency?: VisitUrgency;
    reason?: string;
  } | null;
  googleMapsUrl?: string | null;
  wazeUrl?: string | null;
  locationSource?: string | null;
}

export interface VisitRouteOptions {
  now: Date;
  weeklyQuota: number;
  completedThisWeek: number;
  cooldownDays: number;
  start?: GeoPoint;
  travelTimeSeconds?: (
    from: GeoPoint,
    to: GeoPoint,
  ) => number;
}

export interface VisitRouteStop extends VisitCandidate {
  sequence: number;
  scheduledFor: string;
  reasons: string[];
}

export interface VisitRouteExclusion {
  clientReference: string;
  reason: string;
}

export interface VisitRoutePlan {
  effectiveQuota: number;
  stops: VisitRouteStop[];
  excluded: VisitRouteExclusion[];
  travelProvider: "google_routes" | "euclidean_fallback";
}

const QUALITY_PRIORITY: Record<VisitQuality, number> = {
  bad: 3,
  standard: 2,
  unknown: 1,
  good: 0,
};

const NEED_PRIORITY: Record<VisitNeed, number> = {
  required_complaint: 4,
  recommended: 3,
  optional: 2,
  none: 0,
};

const URGENCY_PRIORITY: Record<VisitUrgency, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const BOGOTA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function finiteNonnegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeInteger(value: number): number {
  return Math.floor(finiteNonnegative(value));
}

function bogotaDate(value: Date): string {
  const parts = BOGOTA_DATE_FORMATTER.formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function isInCooldown(
  lastVisitAt: string | null,
  now: Date,
  cooldownDays: number,
): boolean {
  if (!lastVisitAt) return false;
  const timestamp = Date.parse(lastVisitAt);
  if (!Number.isFinite(timestamp)) return false;
  const elapsedMs = now.getTime() - timestamp;
  return elapsedMs >= 0 &&
    elapsedMs < normalizeInteger(cooldownDays) * 24 * 60 * 60 * 1000;
}

function resolvedNeed(candidate: VisitCandidate): VisitNeed {
  if (candidate.visitNeed) return candidate.visitNeed;
  return candidate.openComplaint ? "required_complaint" : "optional";
}

function resolvedUrgency(candidate: VisitCandidate): VisitUrgency {
  if (candidate.grokDecision?.urgency) return candidate.grokDecision.urgency;
  if (candidate.urgency) return candidate.urgency;
  if (candidate.openComplaint && candidate.pendingReply) return "critical";
  if (candidate.openComplaint || candidate.pendingReply) return "high";
  if (resolvedNeed(candidate) === "recommended" || candidate.quality === "bad") {
    return "medium";
  }
  return "low";
}

function hasUrgentSignal(candidate: VisitCandidate): boolean {
  return candidate.openComplaint || candidate.pendingReply === true;
}

function grokIncludes(candidate: VisitCandidate): boolean {
  return candidate.grokDecision?.includeInRoute === true;
}

function grokExcludes(candidate: VisitCandidate): boolean {
  return candidate.grokDecision?.includeInRoute === false;
}

function defaultInclude(candidate: VisitCandidate): boolean {
  if (hasUrgentSignal(candidate) || grokIncludes(candidate)) return true;
  const need = resolvedNeed(candidate);
  return need === "required_complaint" || need === "recommended" ||
    candidate.quality === "bad";
}

function isRecentService(completedAt: string | null | undefined, now: Date): boolean {
  if (!completedAt) return false;
  const elapsed = now.getTime() - Date.parse(completedAt);
  return Number.isFinite(elapsed) && elapsed >= 0 &&
    elapsed < RECENT_SERVICE_DAYS * 24 * 60 * 60 * 1000;
}

function resolvedGeo(candidate: VisitCandidate): GeoQuality {
  if (candidate.geoQuality) return candidate.geoQuality;
  if (
    candidate.latitude !== null &&
    candidate.longitude !== null &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude)
  ) {
    return "exact";
  }
  return "missing";
}

function comparePriority(a: VisitCandidate, b: VisitCandidate): number {
  const rankA = a.grokDecision?.rank;
  const rankB = b.grokDecision?.rank;
  if (Number.isFinite(rankA) && Number.isFinite(rankB) && rankA !== rankB) {
    return Number(rankA) - Number(rankB);
  }
  const byUrgency = URGENCY_PRIORITY[resolvedUrgency(b)] -
    URGENCY_PRIORITY[resolvedUrgency(a)];
  if (byUrgency !== 0) return byUrgency;
  if (a.openComplaint !== b.openComplaint) return a.openComplaint ? -1 : 1;

  const byNeed = NEED_PRIORITY[resolvedNeed(b)] - NEED_PRIORITY[resolvedNeed(a)];
  if (byNeed !== 0) return byNeed;

  const byQuality = QUALITY_PRIORITY[b.quality] - QUALITY_PRIORITY[a.quality];
  if (byQuality !== 0) return byQuality;

  const byValue = finiteNonnegative(b.lifetimeValueCop) -
    finiteNonnegative(a.lifetimeValueCop);
  if (byValue !== 0) return byValue;

  const byRisk = finiteNonnegative(b.riskScore) -
    finiteNonnegative(a.riskScore);
  if (byRisk !== 0) return byRisk;

  return a.clientReference.localeCompare(b.clientReference);
}

function samePriority(a: VisitCandidate, b: VisitCandidate): boolean {
  return resolvedUrgency(a) === resolvedUrgency(b) &&
    a.openComplaint === b.openComplaint &&
    resolvedNeed(a) === resolvedNeed(b) &&
    a.quality === b.quality &&
    finiteNonnegative(a.lifetimeValueCop) ===
      finiteNonnegative(b.lifetimeValueCop) &&
    finiteNonnegative(a.riskScore) === finiteNonnegative(b.riskScore);
}

function candidatePoint(candidate: VisitCandidate): GeoPoint | null {
  if (resolvedGeo(candidate) === "missing" || resolvedGeo(candidate) === "ambiguous") {
    return null;
  }
  if (
    candidate.latitude === null ||
    candidate.longitude === null ||
    !isUsableGeoPoint({
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    })
  ) {
    return null;
  }
  return {
    latitude: candidate.latitude,
    longitude: candidate.longitude,
  };
}

function euclideanSeconds(from: GeoPoint, to: GeoPoint): number {
  const latitudeDelta = to.latitude - from.latitude;
  const longitudeDelta = to.longitude - from.longitude;
  return Math.hypot(latitudeDelta, longitudeDelta) * 100_000;
}

function travelCost(
  from: GeoPoint,
  candidate: VisitCandidate,
  travelTimeSeconds?: VisitRouteOptions["travelTimeSeconds"],
): number {
  const point = candidatePoint(candidate);
  if (!point) return Number.POSITIVE_INFINITY;
  return (travelTimeSeconds ?? euclideanSeconds)(from, point);
}

function nearestNeighborOrder(
  candidates: VisitCandidate[],
  startingPoint: GeoPoint | undefined,
  travelTimeSeconds?: VisitRouteOptions["travelTimeSeconds"],
): VisitCandidate[] {
  if (!startingPoint || candidates.length < 2) return candidates;

  const remaining = [...candidates];
  const ordered: VisitCandidate[] = [];
  let cursor = startingPoint;
  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = travelCost(cursor, remaining[0], travelTimeSeconds);
    for (let index = 1; index < remaining.length; index += 1) {
      const distance = travelCost(cursor, remaining[index], travelTimeSeconds);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    const [next] = remaining.splice(nearestIndex, 1);
    ordered.push(next);
    cursor = candidatePoint(next) ?? cursor;
  }
  return ordered;
}

function routeEqualPriorityGroups(
  candidates: VisitCandidate[],
  start: GeoPoint | undefined,
  travelTimeSeconds?: VisitRouteOptions["travelTimeSeconds"],
): VisitCandidate[] {
  const ordered: VisitCandidate[] = [];
  let cursor = start;
  let groupStart = 0;
  while (groupStart < candidates.length) {
    let groupEnd = groupStart + 1;
    while (
      groupEnd < candidates.length &&
      samePriority(candidates[groupStart], candidates[groupEnd])
    ) {
      groupEnd += 1;
    }
    const group = nearestNeighborOrder(
      candidates.slice(groupStart, groupEnd),
      cursor,
      travelTimeSeconds,
    );
    ordered.push(...group);
    cursor = candidatePoint(group[group.length - 1]) ?? cursor;
    groupStart = groupEnd;
  }
  return ordered;
}

function reasonsFor(candidate: VisitCandidate): string[] {
  if (candidate.visitReasons?.length) return [...candidate.visitReasons];
  const reasons: string[] = [];
  if (candidate.openComplaint) {
    reasons.push("Queja abierta: atención prioritaria hoy.");
  }
  reasons.push(
    candidate.quality === "bad"
      ? "Calidad reportada requiere seguimiento."
      : `Calidad ${candidate.quality}.`,
  );
  if (candidate.lifetimeValueCop > 0) {
    reasons.push(
      `Valor histórico: ${Math.round(candidate.lifetimeValueCop)} COP.`,
    );
  }
  if (candidate.riskScore > 0) {
    reasons.push(`Riesgo de pérdida: ${Math.round(candidate.riskScore)}/100.`);
  }
  return reasons;
}

export function buildVisitRoute(
  candidates: readonly VisitCandidate[],
  options: VisitRouteOptions,
): VisitRoutePlan {
  const effectiveQuota = Math.max(
    0,
    normalizeInteger(options.weeklyQuota) -
      normalizeInteger(options.completedThisWeek),
  );
  const excluded: VisitRouteExclusion[] = [];
  const eligible: VisitCandidate[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const clientReference = candidate.clientReference.trim();
    if (!clientReference || seen.has(clientReference)) continue;
    seen.add(clientReference);

    if (candidate.optOut) {
      excluded.push({
        clientReference,
        reason: "Cliente excluido por opt-out.",
      });
      continue;
    }
    if (!candidatePoint(candidate)) {
      excluded.push({
        clientReference,
        reason: resolvedGeo(candidate) === "ambiguous"
          ? "Dirección ambigua: queda fuera de la ruta."
          : "Geocodificación débil o ausente: queda fuera de la ruta.",
      });
      continue;
    }
    if (grokExcludes(candidate) && !candidate.openComplaint) {
      excluded.push({
        clientReference,
        reason: candidate.grokDecision?.reason ||
          "Grok lo excluyó de la ruta de relación.",
      });
      continue;
    }
    const recentService = isRecentService(candidate.recentServiceAt, options.now);
    const cooled = isInCooldown(
      candidate.lastVisitAt,
      options.now,
      options.cooldownDays,
    );
    if (
      (recentService || cooled) &&
      !hasUrgentSignal(candidate) &&
      !grokIncludes(candidate)
    ) {
      excluded.push({
        clientReference,
        reason: recentService
          ? `Servicio reciente (≤${RECENT_SERVICE_DAYS} días): queda fuera salvo queja o respuesta pendiente.`
          : `Cliente en cooldown de ${
            normalizeInteger(options.cooldownDays)
          } días.`,
      });
      continue;
    }
    if (!defaultInclude(candidate)) {
      excluded.push({
        clientReference,
        reason: resolvedNeed(candidate) === "none"
          ? "La ficha vigente no recomienda visita."
          : "Opcional: no entra hasta que Grok lo priorice.",
      });
      continue;
    }
    eligible.push({ ...candidate, clientReference });
  }

  eligible.sort(comparePriority);
  const unlimited = eligible.filter((candidate) =>
    hasUrgentSignal(candidate) || resolvedUrgency(candidate) === "critical" ||
    resolvedUrgency(candidate) === "high"
  );
  const normal = eligible
    .filter((candidate) => !unlimited.includes(candidate))
    .slice(0, effectiveQuota);
  const selected = routeEqualPriorityGroups(
    [...unlimited, ...normal],
    options.start,
    options.travelTimeSeconds,
  );
  const scheduledFor = bogotaDate(options.now);

  return {
    effectiveQuota,
    travelProvider: options.travelTimeSeconds
      ? "google_routes"
      : "euclidean_fallback",
    stops: selected.map((candidate, index) => ({
      ...candidate,
      sequence: index + 1,
      scheduledFor,
      reasons: reasonsFor(candidate),
    })),
    excluded,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asVisitQuality(value: unknown): VisitQuality {
  return value === "bad" || value === "good" || value === "unknown"
    ? value
    : "standard";
}

function asVisitNeed(value: unknown): VisitNeed | undefined {
  return value === "required_complaint" || value === "recommended" ||
      value === "optional" || value === "none"
    ? value
    : undefined;
}

function asVisitUrgency(value: unknown): VisitUrgency | undefined {
  return value === "critical" || value === "high" || value === "medium" ||
      value === "low"
    ? value
    : undefined;
}

function asGeoQuality(value: unknown): GeoQuality | undefined {
  return value === "exact" || value === "approximate" || value === "missing" ||
      value === "ambiguous"
    ? value
    : undefined;
}

export function normalizeDraftStops(value: unknown): VisitRouteStop[] {
  if (!Array.isArray(value)) return [];
  const stops: VisitRouteStop[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) continue;
    const clientReference = String(
      item.clientReference ?? item.client_reference ?? "",
    ).trim();
    if (!clientReference) continue;
    const latitude = asFiniteNumber(item.latitude);
    const longitude = asFiniteNumber(item.longitude);
    const grokDecision = isRecord(item.grokDecision)
      ? {
        includeInRoute: item.grokDecision.includeInRoute === true,
        rank: asFiniteNumber(item.grokDecision.rank) ?? undefined,
        urgency: asVisitUrgency(item.grokDecision.urgency),
        reason: typeof item.grokDecision.reason === "string"
          ? item.grokDecision.reason
          : undefined,
      }
      : null;
    stops.push({
      clientReference,
      displayName: typeof item.displayName === "string" && item.displayName.trim()
        ? item.displayName
        : clientReference,
      quality: asVisitQuality(item.quality),
      lifetimeValueCop: asFiniteNumber(item.lifetimeValueCop) ?? 0,
      riskScore: asFiniteNumber(item.riskScore) ?? 0,
      openComplaint: item.openComplaint === true,
      optOut: item.optOut === true,
      lastVisitAt: typeof item.lastVisitAt === "string" ? item.lastVisitAt : null,
      latitude,
      longitude,
      geoQuality: asGeoQuality(item.geoQuality),
      visitNeed: asVisitNeed(item.visitNeed),
      visitReasons: Array.isArray(item.visitReasons)
        ? item.visitReasons.filter((reason): reason is string =>
          typeof reason === "string"
        )
        : undefined,
      directoryId: typeof item.directoryId === "string"
        ? item.directoryId
        : typeof item.directory_id === "string"
        ? item.directory_id
        : null,
      addressLine: typeof item.addressLine === "string" ? item.addressLine : null,
      pendingReply: item.pendingReply === true,
      recentServiceAt: typeof item.recentServiceAt === "string"
        ? item.recentServiceAt
        : null,
      urgency: asVisitUrgency(item.urgency),
      grokDecision,
      googleMapsUrl: typeof item.googleMapsUrl === "string"
        ? item.googleMapsUrl
        : null,
      wazeUrl: typeof item.wazeUrl === "string" ? item.wazeUrl : null,
      locationSource: typeof item.locationSource === "string"
        ? item.locationSource
        : null,
      sequence: asFiniteNumber(item.sequence) ?? index + 1,
      scheduledFor: typeof item.scheduledFor === "string"
        ? item.scheduledFor
        : "",
      reasons: Array.isArray(item.reasons)
        ? item.reasons.filter((reason): reason is string =>
          typeof reason === "string"
        )
        : [],
    });
  }
  return stops;
}

export function isUsableGeoPoint(
  point: GeoPoint | null | undefined,
): point is GeoPoint {
  if (!point) return false;
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
    return false;
  }
  if (point.latitude === 0 && point.longitude === 0) return false;
  return point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180;
}

export interface DeviceOriginDraftResult {
  stops: VisitRouteStop[];
  travelProvider: VisitRoutePlan["travelProvider"];
  changed: boolean;
  originApplied: boolean;
}

export function applyDeviceOriginToDraftStops(input: {
  stops: readonly VisitRouteStop[];
  start: GeoPoint;
  travelTimeSeconds?: VisitRouteOptions["travelTimeSeconds"];
}): DeviceOriginDraftResult {
  const original = input.stops.map((stop) => ({ ...stop }));
  if (!isUsableGeoPoint(input.start)) {
    return {
      stops: original,
      travelProvider: input.travelTimeSeconds
        ? "google_routes"
        : "euclidean_fallback",
      changed: false,
      originApplied: false,
    };
  }

  const usable = original.filter((stop) => candidatePoint(stop));
  if (usable.length === 0) {
    return {
      stops: original,
      travelProvider: input.travelTimeSeconds
        ? "google_routes"
        : "euclidean_fallback",
      changed: false,
      originApplied: false,
    };
  }

  const grouped: VisitRouteStop[][] = [];
  let current: VisitRouteStop[] = [];
  for (const stop of original) {
    if (
      current.length === 0 ||
      resolvedUrgency(current[0]) === resolvedUrgency(stop)
    ) {
      current.push(stop);
      continue;
    }
    grouped.push(current);
    current = [stop];
  }
  if (current.length > 0) grouped.push(current);

  const reordered: VisitRouteStop[] = [];
  let cursor: GeoPoint | undefined = input.start;
  for (const group of grouped) {
    const ordered = nearestNeighborOrder(
      group,
      cursor,
      input.travelTimeSeconds,
    ) as VisitRouteStop[];
    reordered.push(...ordered);
    cursor = candidatePoint(ordered[ordered.length - 1]) ?? cursor;
  }

  const sequenced = reordered.map((stop, index) => ({
    ...stop,
    sequence: index + 1,
  }));
  const changed = sequenced.some((stop, index) =>
    stop.clientReference !== original[index]?.clientReference
  );

  return {
    stops: sequenced,
    travelProvider: input.travelTimeSeconds
      ? "google_routes"
      : "euclidean_fallback",
    changed,
    originApplied: true,
  };
}

export async function fetchGoogleRouteSeconds(
  points: GeoPoint[],
  apiKey: string,
): Promise<VisitRouteOptions["travelTimeSeconds"] | null> {
  if (points.length < 2 || !apiKey) return null;
  const origins = points.map((point) => `${point.latitude},${point.longitude}`)
    .join("|");
  const url =
    `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${
      encodeURIComponent(origins)
    }&destinations=${encodeURIComponent(origins)}&mode=driving&key=${
      encodeURIComponent(apiKey)
    }`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const payload = await response.json() as {
    rows?: Array<
      { elements?: Array<{ duration?: { value?: number }; status?: string }> }
    >;
  };
  const matrix = payload.rows ?? [];
  const keyOf = (point: GeoPoint) =>
    `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
  const index = new Map(points.map((point, i) => [keyOf(point), i]));
  return (from, to) => {
    const fromIndex = index.get(keyOf(from));
    const toIndex = index.get(keyOf(to));
    if (fromIndex === undefined || toIndex === undefined) {
      return Number.POSITIVE_INFINITY;
    }
    const seconds = matrix[fromIndex]?.elements?.[toIndex]?.duration?.value;
    return Number.isFinite(seconds) ? Number(seconds) : Number.POSITIVE_INFINITY;
  };
}

const COVERAGE_ZONES = [
  { lat: 4.813, lng: -75.696, radiusKm: 15 },
  { lat: 4.839, lng: -75.667, radiusKm: 10 },
  { lat: 4.817, lng: -75.917, radiusKm: 8 },
  { lat: 4.868, lng: -75.742, radiusKm: 8 },
  { lat: 4.7467, lng: -75.9117, radiusKm: 8 },
] as const;

const LAT_LNG_RE = /(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/;

function haversineKm(from: GeoPoint, to: GeoPoint): number {
  const toRad = (value: number) => value * (Math.PI / 180);
  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isInCleaningCoverage(point: GeoPoint): boolean {
  if (!isUsableGeoPoint(point)) return false;
  return COVERAGE_ZONES.some((zone) =>
    haversineKm(point, { latitude: zone.lat, longitude: zone.lng }) <=
      zone.radiusKm
  );
}

export function parseLatLngFromNavUrl(url: string): GeoPoint | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  const at = trimmed.match(new RegExp(`@${LAT_LNG_RE.source}`));
  if (at) {
    const latitude = Number(at[1]);
    const longitude = Number(at[2]);
    const point = { latitude, longitude };
    return isUsableGeoPoint(point) && isInCleaningCoverage(point) ? point : null;
  }
  try {
    const parsed = new URL(trimmed);
    for (const key of ["ll", "q", "query", "destination", "daddr"]) {
      const raw = parsed.searchParams.get(key);
      if (!raw) continue;
      const pair = raw.match(LAT_LNG_RE);
      if (!pair) continue;
      const point = { latitude: Number(pair[1]), longitude: Number(pair[2]) };
      if (isUsableGeoPoint(point) && isInCleaningCoverage(point)) return point;
    }
  } catch {
    return null;
  }
  return null;
}

export function hydrateStopCoordinates(
  stop: VisitRouteStop,
  geocoded?: GeoPoint | null,
): VisitRouteStop {
  const current = candidatePoint(stop);
  if (current && isInCleaningCoverage(current)) {
    return { ...stop, geoQuality: stop.geoQuality === "missing" ? "exact" : stop.geoQuality };
  }

  const fromUrl = (stop.googleMapsUrl && parseLatLngFromNavUrl(stop.googleMapsUrl)) ||
    (stop.wazeUrl && parseLatLngFromNavUrl(stop.wazeUrl)) ||
    null;
  if (fromUrl) {
    return {
      ...stop,
      latitude: fromUrl.latitude,
      longitude: fromUrl.longitude,
      geoQuality: "exact",
      locationSource: stop.locationSource ?? "maps_url",
    };
  }

  if (geocoded && isUsableGeoPoint(geocoded) && isInCleaningCoverage(geocoded)) {
    return {
      ...stop,
      latitude: geocoded.latitude,
      longitude: geocoded.longitude,
      geoQuality: "approximate",
      locationSource: "geocode",
    };
  }

  if (current) {
    return { ...stop, latitude: null, longitude: null, geoQuality: "ambiguous" };
  }
  return { ...stop, latitude: null, longitude: null, geoQuality: "missing" };
}

export function hydrateStopsFromKnownSources(
  stops: readonly VisitRouteStop[],
  geocodes: Record<string, GeoPoint> = {},
): { stops: VisitRouteStop[]; changed: boolean } {
  const next = stops.map((stop) => {
    const address = stop.addressLine?.trim() ?? "";
    return hydrateStopCoordinates(stop, address ? geocodes[address] ?? null : null);
  });
  const changed = next.some((stop, index) =>
    stop.latitude !== stops[index]?.latitude ||
    stop.longitude !== stops[index]?.longitude ||
    stop.geoQuality !== stops[index]?.geoQuality
  );
  return { stops: next, changed };
}

export interface RouteLegMetrics {
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteDirectionsOverlay {
  overviewPolyline: string | null;
  legs: RouteLegMetrics[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  travelProvider: VisitRoutePlan["travelProvider"];
}

export function usableRoutePoints(stops: readonly VisitRouteStop[]): GeoPoint[] {
  return stops.flatMap((stop) => {
    const point = candidatePoint(stop);
    return point && isInCleaningCoverage(point) ? [point] : [];
  });
}

export function existingDirectionsOverlay(value: unknown): RouteDirectionsOverlay | null {
  if (!isRecord(value) || !Array.isArray(value.legs) || value.legs.length === 0) {
    return null;
  }
  const legs = value.legs.flatMap((item) => {
    if (!isRecord(item)) return [];
    const distanceMeters = Number(item.distanceMeters ?? 0);
    const durationSeconds = Number(item.durationSeconds ?? 0);
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return [];
    return [{
      distanceMeters,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    }];
  });
  if (legs.length === 0) return null;
  const travelProvider = value.travelProvider === "google_routes"
    ? "google_routes"
    : "euclidean_fallback";
  return {
    overviewPolyline: typeof value.overviewPolyline === "string" ? value.overviewPolyline : null,
    legs,
    totalDistanceMeters: Number(value.totalDistanceMeters ?? legs.reduce((sum, leg) => sum + leg.distanceMeters, 0)),
    totalDurationSeconds: Number(value.totalDurationSeconds ?? legs.reduce((sum, leg) => sum + leg.durationSeconds, 0)),
    travelProvider,
  };
}

export function euclideanDirectionsOverlay(
  origin: GeoPoint | null,
  stops: readonly VisitRouteStop[],
): RouteDirectionsOverlay {
  const points = [
    ...(origin && isUsableGeoPoint(origin) ? [origin] : []),
    ...usableRoutePoints(stops),
  ];
  const legs: RouteLegMetrics[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const distanceMeters = Math.round(haversineKm(points[index - 1], points[index]) * 1000);
    legs.push({
      distanceMeters,
      durationSeconds: Math.round(euclideanSeconds(points[index - 1], points[index])),
    });
  }
  return {
    overviewPolyline: null,
    legs,
    totalDistanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
    totalDurationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
    travelProvider: "euclidean_fallback",
  };
}

export async function geocodeAddress(
  address: string,
  apiKey: string,
): Promise<GeoPoint | null> {
  const trimmed = address.trim();
  if (!trimmed || !apiKey) return null;
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${
      encodeURIComponent(`${trimmed}, Risaralda, Colombia`)
    }&key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const payload = await response.json() as {
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
  };
  const location = payload.results?.[0]?.geometry?.location;
  if (typeof location?.lat !== "number" || typeof location?.lng !== "number") {
    return null;
  }
  const point = { latitude: location.lat, longitude: location.lng };
  return isUsableGeoPoint(point) && isInCleaningCoverage(point) ? point : null;
}

export async function hydrateStopsWithGeocode(
  stops: readonly VisitRouteStop[],
  apiKey: string,
): Promise<{ stops: VisitRouteStop[]; changed: boolean }> {
  const geocodes: Record<string, GeoPoint> = {};
  if (apiKey) {
    for (const stop of stops) {
      const address = stop.addressLine?.trim() ?? "";
      if (!address || geocodes[address]) continue;
      const preview = hydrateStopCoordinates(stop);
      if (candidatePoint(preview)) continue;
      if (stop.geoQuality === "missing" || stop.geoQuality === "ambiguous") {
        continue;
      }
      const geocoded = await geocodeAddress(address, apiKey);
      if (geocoded) geocodes[address] = geocoded;
    }
  }
  return hydrateStopsFromKnownSources(stops, geocodes);
}

export async function fetchGoogleDirectionsOverlay(
  origin: GeoPoint | null,
  stops: readonly VisitRouteStop[],
  apiKey: string,
): Promise<RouteDirectionsOverlay | null> {
  const destinations = usableRoutePoints(stops);
  const points = [
    ...(origin && isUsableGeoPoint(origin) ? [origin] : []),
    ...destinations,
  ];
  if (points.length < 2 || !apiKey) return null;
  const originPoint = points[0];
  const destination = points[points.length - 1];
  const waypoints = points.slice(1, -1)
    .map((point) => `${point.latitude},${point.longitude}`)
    .join("|");
  const params = new URLSearchParams({
    origin: `${originPoint.latitude},${originPoint.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    mode: "driving",
    key: apiKey,
  });
  if (waypoints) params.set("waypoints", waypoints);
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?${params.toString()}`,
  );
  if (!response.ok) return null;
  const payload = await response.json() as {
    status?: string;
    routes?: Array<{
      overview_polyline?: { points?: string };
      legs?: Array<{
        distance?: { value?: number };
        duration?: { value?: number };
      }>;
    }>;
  };
  const route = payload.routes?.[0];
  if (!route || payload.status !== "OK") return null;
  const legs = (route.legs ?? []).map((leg) => ({
    distanceMeters: Number(leg.distance?.value ?? 0),
    durationSeconds: Number(leg.duration?.value ?? 0),
  })).filter((leg) => Number.isFinite(leg.distanceMeters));
  if (legs.length === 0) return null;
  return {
    overviewPolyline: route.overview_polyline?.points ?? null,
    legs,
    totalDistanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0),
    totalDurationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0),
    travelProvider: "google_routes",
  };
}

export function mergeRouteGeoNotes(
  value: unknown,
  overlay: RouteDirectionsOverlay,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  const notes = isRecord(value) ? { ...value } : {};
  delete notes.start;
  delete notes.deviceStart;
  delete notes.origin;
  delete notes.latitude;
  delete notes.longitude;
  return {
    ...notes,
    ...extras,
    travelProvider: overlay.travelProvider,
    overviewPolyline: overlay.overviewPolyline,
    legs: overlay.legs,
    totalDistanceMeters: overlay.totalDistanceMeters,
    totalDurationSeconds: overlay.totalDurationSeconds,
  };
}
