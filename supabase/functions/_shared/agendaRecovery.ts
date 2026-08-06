export type AgendaRecoveryFlag =
  | "unknown_price"
  | "unknown_cost"
  | "non_positive_margin"
  | "price_conflict";

export interface AgendaRecoveryAddonInput {
  addonId: string;
  label: string;
  minutes: number;
  priceCOP: number | null;
}

export interface AgendaRecoveryAddon {
  addonId: string;
  label: string;
  minutes: number;
  priceCOP: number | null;
  saleAllowed: boolean;
  flags: AgendaRecoveryFlag[];
}

export interface AgendaRecoveryWindowInput {
  id: string;
  cleanerId: string;
  cleanerName: string;
  windowStart: string;
  windowEnd: string;
  availableMinutes: number;
  acceptsComposite: boolean;
  singlePriceCOP: number | null;
  pairPriceCOP: number | null;
  estimatedMarginalCostCOP: number | null;
  addons?: AgendaRecoveryAddonInput[];
}

export interface AgendaRecoveryAlternative {
  id: string;
  kind: "single" | "pair";
  cleanerIds: string[];
  cleanerNames: string[];
  windowStart: string;
  windowEnd: string;
  availableMinutes: number;
  priceCOP: number | null;
  estimatedMarginalCostCOP: number | null;
  contributionMarginCOP: number | null;
  contributionMarginPercent: number | null;
  flags: AgendaRecoveryFlag[];
  saleAllowed: boolean;
  addons: AgendaRecoveryAddon[];
}

function isKnownMoney(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeAddons(
  addons: AgendaRecoveryAddonInput[] | undefined,
  parentFlags: AgendaRecoveryFlag[],
): AgendaRecoveryAddon[] {
  return (addons ?? []).map((addon) => {
    const priceKnown = isKnownMoney(addon.priceCOP);
    const flags = [
      ...parentFlags,
      ...(priceKnown ? [] : ["unknown_price" as const]),
    ];
    return {
      addonId: addon.addonId,
      label: addon.label,
      minutes: Math.max(0, Math.round(addon.minutes)),
      priceCOP: priceKnown ? addon.priceCOP : null,
      saleAllowed: flags.length === 0,
      flags: [...new Set(flags)],
    };
  });
}

function buildAlternative(input: {
  id: string;
  kind: "single" | "pair";
  cleanerIds: string[];
  cleanerNames: string[];
  windowStart: string;
  windowEnd: string;
  availableMinutes: number;
  priceCOP: number | null;
  estimatedMarginalCostCOP: number | null;
  addons?: AgendaRecoveryAddonInput[];
  extraFlags?: AgendaRecoveryFlag[];
}): AgendaRecoveryAlternative {
  const flags = [...(input.extraFlags ?? [])];
  const priceKnown = isKnownMoney(input.priceCOP);
  const costKnown = isKnownMoney(input.estimatedMarginalCostCOP);
  if (!priceKnown) flags.push("unknown_price");
  if (!costKnown) flags.push("unknown_cost");

  const priceCOP = priceKnown ? input.priceCOP : null;
  const marginalCostCOP = costKnown ? input.estimatedMarginalCostCOP : null;
  const margin = priceCOP !== null && marginalCostCOP !== null
    ? priceCOP - marginalCostCOP
    : null;
  if (margin !== null && margin <= 0) flags.push("non_positive_margin");

  const contributionMarginPercent =
    margin !== null && priceCOP !== null && priceCOP > 0
      ? roundPercent((margin / priceCOP) * 100)
      : null;

  return {
    id: input.id,
    kind: input.kind,
    cleanerIds: input.cleanerIds,
    cleanerNames: input.cleanerNames,
    windowStart: input.windowStart,
    windowEnd: input.windowEnd,
    availableMinutes: Math.max(0, Math.round(input.availableMinutes)),
    priceCOP,
    estimatedMarginalCostCOP: marginalCostCOP,
    contributionMarginCOP: margin,
    contributionMarginPercent,
    flags: [...new Set(flags)],
    saleAllowed: flags.length === 0,
    addons: normalizeAddons(input.addons, flags),
  };
}

export function buildAgendaRecoveryAlternatives(
  windows: AgendaRecoveryWindowInput[],
): AgendaRecoveryAlternative[] {
  const singles = windows.map((window) =>
    buildAlternative({
      id: `single:${window.id}`,
      kind: "single",
      cleanerIds: [window.cleanerId],
      cleanerNames: [window.cleanerName],
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      availableMinutes: window.availableMinutes,
      priceCOP: window.singlePriceCOP,
      estimatedMarginalCostCOP: window.estimatedMarginalCostCOP,
      addons: window.addons,
    })
  );

  const pairs: AgendaRecoveryAlternative[] = [];
  for (let leftIndex = 0; leftIndex < windows.length; leftIndex += 1) {
    const left = windows[leftIndex];
    if (!left.acceptsComposite) continue;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < windows.length;
      rightIndex += 1
    ) {
      const right = windows[rightIndex];
      if (!right.acceptsComposite || left.cleanerId === right.cleanerId) {
        continue;
      }

      const startMs = Math.max(
        Date.parse(left.windowStart),
        Date.parse(right.windowStart),
      );
      const endMs = Math.min(
        Date.parse(left.windowEnd),
        Date.parse(right.windowEnd),
      );
      if (
        !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs
      ) {
        continue;
      }

      const pairPrices = [left.pairPriceCOP, right.pairPriceCOP].filter(
        isKnownMoney,
      );
      const priceConflict = pairPrices.length === 2 &&
        pairPrices[0] !== pairPrices[1];
      const pairPrice = !priceConflict && pairPrices.length === 2
        ? pairPrices[0]
        : null;
      const pairCost = isKnownMoney(left.estimatedMarginalCostCOP) &&
          isKnownMoney(right.estimatedMarginalCostCOP)
        ? left.estimatedMarginalCostCOP + right.estimatedMarginalCostCOP
        : null;

      pairs.push(
        buildAlternative({
          id: `pair:${left.id}:${right.id}`,
          kind: "pair",
          cleanerIds: [left.cleanerId, right.cleanerId],
          cleanerNames: [left.cleanerName, right.cleanerName],
          windowStart:
            Date.parse(left.windowStart) >= Date.parse(right.windowStart)
              ? left.windowStart
              : right.windowStart,
          windowEnd: Date.parse(left.windowEnd) <= Date.parse(right.windowEnd)
            ? left.windowEnd
            : right.windowEnd,
          availableMinutes: Math.round((endMs - startMs) / 60_000),
          priceCOP: pairPrice,
          estimatedMarginalCostCOP: pairCost,
          extraFlags: priceConflict ? ["price_conflict"] : undefined,
        }),
      );
    }
  }

  return [...singles, ...pairs];
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function buildRecoveryJobPlan(input: {
  bogotaDate: string;
  bogotaHour: number;
}): {
  shouldRun: boolean;
  operationalDate: string;
  reason: "before_cutoff" | "scheduled_recovery";
} {
  const shouldRun = input.bogotaHour >= 18;
  return {
    shouldRun,
    operationalDate: addDays(input.bogotaDate, 1),
    reason: shouldRun ? "scheduled_recovery" : "before_cutoff",
  };
}

function formatCop(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

export function formatRecoveryWhatsAppScript(
  clientName: string | null,
  dateLabel: string,
  alternative: AgendaRecoveryAlternative,
): string {
  const greeting = clientName?.trim() ? `Hola ${clientName.trim()},` : "Hola,";
  const teamLabel = alternative.kind === "pair"
    ? "un equipo de dos profesionales"
    : alternative.cleanerNames[0] || "una profesional";
  const priceLine = alternative.saleAllowed && alternative.priceCOP !== null
    ? `La tarifa confirmada es ${formatCop(alternative.priceCOP)}.`
    : "Antes de reservar debemos confirmar la tarifa.";
  return [
    greeting,
    `tenemos un espacio disponible el ${dateLabel} con ${teamLabel}.`,
    priceLine,
    "¿Te gustaría que lo revisemos contigo?",
  ].join(" ");
}
