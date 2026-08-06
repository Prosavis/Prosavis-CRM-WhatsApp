export type VisitQuality = "bad" | "standard" | "good" | "unknown";

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
}

export interface VisitRouteOptions {
  now: Date;
  weeklyQuota: number;
  completedThisWeek: number;
  cooldownDays: number;
  start?: GeoPoint;
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
}

const QUALITY_PRIORITY: Record<VisitQuality, number> = {
  bad: 3,
  standard: 2,
  unknown: 1,
  good: 0,
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

function comparePriority(a: VisitCandidate, b: VisitCandidate): number {
  if (a.openComplaint !== b.openComplaint) return a.openComplaint ? -1 : 1;

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
    a.quality === b.quality &&
    finiteNonnegative(a.lifetimeValueCop) ===
      finiteNonnegative(b.lifetimeValueCop) &&
    finiteNonnegative(a.riskScore) === finiteNonnegative(b.riskScore);
}

function candidatePoint(candidate: VisitCandidate): GeoPoint | null {
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

function distanceSquared(from: GeoPoint, candidate: VisitCandidate): number {
  const point = candidatePoint(candidate);
  if (!point) return Number.POSITIVE_INFINITY;
  const latitudeDelta = point.latitude - from.latitude;
  const longitudeDelta = point.longitude - from.longitude;
  return latitudeDelta * latitudeDelta + longitudeDelta * longitudeDelta;
}

function nearestNeighborOrder(
  candidates: VisitCandidate[],
  startingPoint: GeoPoint | undefined,
): VisitCandidate[] {
  if (!startingPoint || candidates.length < 2) return candidates;

  const remaining = [...candidates];
  const ordered: VisitCandidate[] = [];
  let cursor = startingPoint;
  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = distanceSquared(cursor, remaining[0]);
    for (let index = 1; index < remaining.length; index += 1) {
      const distance = distanceSquared(cursor, remaining[index]);
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
    );
    ordered.push(...group);
    cursor = candidatePoint(group[group.length - 1]) ?? cursor;
    groupStart = groupEnd;
  }
  return ordered;
}

function reasonsFor(candidate: VisitCandidate): string[] {
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
  );
  const scheduledFor = bogotaDate(options.now);

  return {
    effectiveQuota,
    stops: selected.map((candidate, index) => ({
      ...candidate,
      sequence: index + 1,
      scheduledFor,
      reasons: reasonsFor(candidate),
    })),
    excluded,
  };
}
