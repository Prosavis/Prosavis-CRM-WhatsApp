import type {
  AgendaEngineWeights,
  AgendaFeatureVector,
  AgendaOption,
} from "./types.ts";

type FeatureKey = keyof AgendaEngineWeights;

const FEATURE_KEYS: FeatureKey[] = [
  "marginalCost",
  "travelMinutes",
  "rating",
  "clientAffinity",
  "incomeEquity",
  "gapFit",
];

function rawFeature(
  vector: AgendaFeatureVector,
  key: FeatureKey,
): number | null {
  switch (key) {
    case "marginalCost":
      return vector.marginalCostCOP;
    case "travelMinutes":
      return vector.travelMinutes;
    case "rating":
      return vector.rating;
    case "clientAffinity":
      return vector.clientAffinity;
    case "incomeEquity":
      return vector.income30dCOP;
    case "gapFit":
      return vector.gapResidualMinutes;
    default: {
      const exhaustive: never = key;
      return exhaustive;
    }
  }
}

function lowerIsBetter(key: FeatureKey): boolean {
  return key === "marginalCost" ||
    key === "travelMinutes" ||
    key === "incomeEquity" ||
    key === "gapFit";
}

function normalize(
  value: number,
  minimum: number,
  maximum: number,
  invert: boolean,
): number {
  if (minimum === maximum) return 1;
  const ratio = (value - minimum) / (maximum - minimum);
  return invert ? 1 - ratio : ratio;
}

function validateWeights(weights: AgendaEngineWeights): string[] {
  const flags: string[] = [];
  let total = 0;
  for (const key of FEATURE_KEYS) {
    const weight = weights[key];
    if (!Number.isFinite(weight) || weight < 0) {
      flags.push(`invalid_weight_${key}`);
      continue;
    }
    total += weight;
  }
  if (total <= 0) flags.push("engine_weights_empty");
  return flags;
}

export function scoreAgendaOptions(
  options: AgendaOption[],
  weights: AgendaEngineWeights,
): { options: AgendaOption[]; flags: string[] } {
  const flags = validateWeights(weights);
  if (flags.length > 0) {
    return {
      options: options.map((option) => ({
        ...option,
        score: null,
        hardBlocked: true,
        complianceFlags: [...option.complianceFlags, ...flags],
      })),
      flags,
    };
  }

  const bounds = new Map<FeatureKey, { minimum: number; maximum: number }>();
  for (const key of FEATURE_KEYS) {
    const values = options
      .map((option) => rawFeature(option.featureVector, key))
      .filter((value): value is number =>
        value !== null && Number.isFinite(value)
      );
    if (values.length > 0) {
      bounds.set(key, {
        minimum: Math.min(...values),
        maximum: Math.max(...values),
      });
    }
  }

  const productiveKeys: FeatureKey[] = [
    "rating",
    "clientAffinity",
    "incomeEquity",
  ];

  const scored = options.map((option) => {
    if (option.hardBlocked) {
      return { ...option, score: null, recommended: false };
    }

    let weightedScore = 0;
    let appliedWeight = 0;
    const optionFlags = [...option.complianceFlags];
    let incompleteProductivity = false;
    for (const key of FEATURE_KEYS) {
      const weight = weights[key];
      if (weight === 0) continue;
      const value = rawFeature(option.featureVector, key);
      const featureBounds = bounds.get(key);
      if (value === null || !featureBounds) {
        optionFlags.push(`missing_scoring_${key}`);
        if (productiveKeys.includes(key)) incompleteProductivity = true;
        continue;
      }
      weightedScore += weight * normalize(
        value,
        featureBounds.minimum,
        featureBounds.maximum,
        lowerIsBetter(key),
      );
      appliedWeight += weight;
    }

    if (incompleteProductivity) {
      optionFlags.push("incomplete_productivity_vector");
      return {
        ...option,
        score: null,
        recommended: false,
        complianceFlags: [...new Set(optionFlags)].sort(),
      };
    }

    return {
      ...option,
      score: appliedWeight > 0
        ? Math.round(weightedScore / appliedWeight * 10000) / 100
        : null,
      recommended: option.recommended && appliedWeight > 0,
      complianceFlags: [...new Set(optionFlags)].sort(),
    };
  });

  return {
    options: scored.sort((a, b) => {
      if (a.hardBlocked !== b.hardBlocked) return a.hardBlocked ? 1 : -1;
      const scoreDifference = (b.score ?? -1) - (a.score ?? -1);
      if (scoreDifference !== 0) return scoreDifference;
      if (a.mode !== b.mode) return a.mode === "single" ? -1 : 1;
      return a.optionId.localeCompare(b.optionId);
    }),
    flags,
  };
}
