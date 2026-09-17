export type VisitQuality = "bad" | "standard" | "good" | "unknown";
export type GeoQuality = "exact" | "approximate" | "missing" | "ambiguous";
export type VisitNeed = "required_complaint" | "recommended" | "optional" | "none";

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
  return a.openComplaint === b.openComplaint &&
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
    !Number.isFinite(candidate.latitude) ||
    !Number.isFinite(candidate.longitude)
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
    if (
      !candidate.openComplaint &&
      isInCooldown(
        candidate.lastVisitAt,
        options.now,
        options.cooldownDays,
      )
    ) {
      excluded.push({
        clientReference,
        reason: `Cliente en cooldown de ${
          normalizeInteger(options.cooldownDays)
        } días.`,
      });
      continue;
    }
    if (resolvedNeed(candidate) === "none" && !candidate.openComplaint) {
      excluded.push({
        clientReference,
        reason: "La ficha vigente no recomienda visita.",
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
    eligible.push({ ...candidate, clientReference });
  }

  eligible.sort(comparePriority);
  const complaints = eligible.filter((candidate) => candidate.openComplaint);
  const normal = eligible
    .filter((candidate) => !candidate.openComplaint)
    .slice(0, effectiveQuota);
  const selected = routeEqualPriorityGroups(
    [...complaints, ...normal],
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
