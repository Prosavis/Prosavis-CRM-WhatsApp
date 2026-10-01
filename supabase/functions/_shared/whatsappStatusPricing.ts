export interface StatusPricing {
  category: string | null;
  type: string | null;
  billable: boolean | null;
}

export interface PricingColumnPatch {
  pricing_category: string | null;
  pricing_type: string | null;
  pricing_billable: boolean | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textField(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function billableField(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  return null;
}

/** Free Entry Point: Meta manda un type que contiene `free_entry`. No se inventan otros aliases. */
export function isFreeEntryPointType(pricingType: string | null): boolean {
  return Boolean(pricingType && pricingType.includes('free_entry'));
}

export function extractStatusPricing(status: Record<string, unknown>): StatusPricing | null {
  const pricing = asRecord(status.pricing);
  if (!pricing) return null;
  const category = textField(pricing.category);
  const type = textField(pricing.type);
  const billable = billableField(pricing.billable);
  if (!category && !type && billable === null) return null;
  return { category, type, billable };
}

/**
 * El cargo es al entregar. `read` también persiste si el webhook trae pricing
 * (un read implica que ya se entregó). `sent` y `failed` no llenan las columnas.
 */
export function pricingPatchForStatus(
  status: Record<string, unknown>,
): PricingColumnPatch | null {
  const name = textField(status.status);
  if (name !== 'delivered' && name !== 'read') return null;
  const pricing = extractStatusPricing(status);
  if (!pricing) return null;
  return {
    pricing_category: pricing.category,
    pricing_type: pricing.type,
    pricing_billable: pricing.billable,
  };
}
