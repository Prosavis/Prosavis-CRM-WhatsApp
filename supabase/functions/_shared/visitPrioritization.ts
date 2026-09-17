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
