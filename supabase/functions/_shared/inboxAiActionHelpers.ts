import type { InboxAiProposedAction } from './inboxAiActions.ts';
import { PROFESSIONAL_KIT_SURCHARGE_COP } from './pricingCatalog.ts';
import {
  getStaticCleaningKitWompiUrl,
  getStaticCleaningWompiUrl,
} from './wompiLinks.ts';

export function normalizeTagNameForMatch(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

export function mergeTagIds(
  currentIds: readonly string[],
  tagId: string,
): { nextIds: string[]; alreadyPresent: boolean } {
  const safeCurrent = currentIds.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  if (safeCurrent.includes(tagId)) {
    return { nextIds: [...safeCurrent], alreadyPresent: true };
  }
  return { nextIds: [...safeCurrent, tagId], alreadyPresent: false };
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildSuggestionFingerprint(
  suggestion: string,
  actions: ReadonlyArray<Pick<InboxAiProposedAction, 'id' | 'type' | 'payload'>>,
): string {
  const canonical = JSON.stringify({
    suggestion: suggestion.trim(),
    actions: actions.map((action) => ({
      id: action.id,
      type: action.type,
      payload: action.payload,
    })),
  });
  return `fp_${fnv1aHex(canonical)}`;
}

export function assertSuggestionNotStale(
  expectedFingerprint: string | undefined,
  currentFingerprint: string | undefined,
): void {
  if (!expectedFingerprint || !currentFingerprint) return;
  if (expectedFingerprint !== currentFingerprint) {
    throw new Error('Suggestion is stale; request a fresh AI suggestion before executing.');
  }
}

/**
 * Pre-execute guard for confirmed actions.
 * When a captured fingerprint is present, current must match (calls assertSuggestionNotStale).
 */
export function prepareConfirmedInboxAiActionFingerprints(params: {
  capturedFingerprint: string | null | undefined;
  currentFingerprint: string | null | undefined;
}): {
  suggestionFingerprint?: string;
  currentSuggestionFingerprint?: string;
} {
  const captured = params.capturedFingerprint?.trim() || undefined;
  const current = params.currentFingerprint?.trim() || undefined;
  assertSuggestionNotStale(captured, current);
  if (!captured) return {};
  return {
    suggestionFingerprint: captured,
    currentSuggestionFingerprint: current,
  };
}

/**
 * Post-resolve UI guard: ignore in-flight success side-effects after re-suggestion.
 * Does not cancel remote mutations already performed.
 */
export function shouldApplyInboxAiActionUiEffects(
  capturedFingerprint: string | null | undefined,
  currentFingerprint: string | null | undefined,
): boolean {
  const captured = capturedFingerprint?.trim() || '';
  if (!captured) return true;
  const current = currentFingerprint?.trim() || '';
  return captured === current;
}

export function canStartActionExecution(
  executingActionId: string | null | undefined,
  actionId: string,
): boolean {
  if (!actionId) return false;
  return !executingActionId;
}

/** URLs Wompi grounded posibles para un monto (base o total con kit). */
export function groundedWompiUrlsForAmount(amountCOP: number): string[] {
  if (!Number.isFinite(amountCOP) || amountCOP <= 0) return [];
  const rounded = Math.round(amountCOP);
  const urls = new Set<string>();
  const direct = getStaticCleaningWompiUrl(rounded);
  if (direct) urls.add(direct);
  const kitBase = rounded - PROFESSIONAL_KIT_SURCHARGE_COP;
  if (kitBase > 0) {
    const kit = getStaticCleaningKitWompiUrl(kitBase);
    if (kit) urls.add(kit);
  }
  return [...urls];
}

/** Revalida un link Wompi contra el catálogo grounded por monto. */
export function resolveGroundedWompiUrlForAmount(
  amountCOP: number,
  requestedUrl?: string,
): string | null {
  const candidates = groundedWompiUrlsForAmount(amountCOP);
  if (!candidates.length) return null;
  if (requestedUrl) {
    return candidates.includes(requestedUrl) ? requestedUrl : null;
  }
  return candidates[0] ?? null;
}

export function buildTemplateBodyComponents(
  variables: Record<string, string>,
): Array<{ type: 'body'; parameters: Array<{ type: 'text'; text: string }> }> | undefined {
  const entries = Object.entries(variables)
    .map(([key, value]) => [key.trim(), String(value ?? '').trim()] as const)
    .filter(([key, value]) => key.length > 0 && value.length > 0)
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }));
  if (!entries.length) return undefined;
  return [{
    type: 'body',
    parameters: entries.map(([, text]) => ({ type: 'text' as const, text })),
  }];
}
