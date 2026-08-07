import { describe, expect, it } from 'vitest';
import type { InboxAiProposedAction } from '../../supabase/functions/_shared/inboxAiActions';
import {
  assertSuggestionNotStale,
  buildSuggestionFingerprint,
  canStartActionExecution,
  mergeTagIds,
  normalizeTagNameForMatch,
  resolveGroundedWompiUrlForAmount,
} from '../../supabase/functions/_shared/inboxAiActionHelpers';

const tagAction = (
  id: string,
  tagName: string,
): InboxAiProposedAction => ({
  id,
  type: 'apply_tag',
  label: `Aplicar ${tagName}`,
  reason: 'motivo',
  requiresConfirmation: true,
  payload: { tagName },
});

describe('normalizeTagNameForMatch', () => {
  it('normalizes case, accents and whitespace for catalog matching', () => {
    expect(normalizeTagNameForMatch('  Interésado  VIP ')).toBe('interesado vip');
    expect(normalizeTagNameForMatch('INTERESADO VIP')).toBe('interesado vip');
  });
});

describe('mergeTagIds', () => {
  it('appends a missing tag id without overwriting existing ids', () => {
    expect(mergeTagIds(['a', 'b'], 'c')).toEqual({
      nextIds: ['a', 'b', 'c'],
      alreadyPresent: false,
    });
  });

  it('keeps the current list when the tag is already present', () => {
    expect(mergeTagIds(['a', 'b'], 'a')).toEqual({
      nextIds: ['a', 'b'],
      alreadyPresent: true,
    });
  });
});

describe('buildSuggestionFingerprint', () => {
  it('is stable for the same suggestion and actions', () => {
    const actions = [tagAction('id-1', 'VIP')];
    const left = buildSuggestionFingerprint('Hola', actions);
    const right = buildSuggestionFingerprint('Hola', actions);
    expect(left).toBe(right);
    expect(left).toMatch(/^fp_/);
  });

  it('changes when suggestion or actions change', () => {
    const actions = [tagAction('id-1', 'VIP')];
    const base = buildSuggestionFingerprint('Hola', actions);
    expect(buildSuggestionFingerprint('Hola mundo', actions)).not.toBe(base);
    expect(buildSuggestionFingerprint('Hola', [tagAction('id-2', 'VIP')])).not.toBe(base);
  });
});

describe('assertSuggestionNotStale', () => {
  it('accepts matching fingerprints and empty expected values', () => {
    expect(() => assertSuggestionNotStale('fp_abc', 'fp_abc')).not.toThrow();
    expect(() => assertSuggestionNotStale(undefined, 'fp_abc')).not.toThrow();
    expect(() => assertSuggestionNotStale('fp_abc', undefined)).not.toThrow();
  });

  it('rejects mismatched fingerprints', () => {
    expect(() => assertSuggestionNotStale('fp_old', 'fp_new')).toThrow(/stale/i);
  });
});

describe('canStartActionExecution', () => {
  it('blocks double-clicks while another action is pending', () => {
    expect(canStartActionExecution(null, 'a1')).toBe(true);
    expect(canStartActionExecution('a1', 'a1')).toBe(false);
    expect(canStartActionExecution('a1', 'a2')).toBe(false);
  });
});

describe('resolveGroundedWompiUrlForAmount', () => {
  it('resolves base and kit checkout URLs from the grounded catalog', () => {
    expect(resolveGroundedWompiUrlForAmount(88_000)).toBe(
      'https://checkout.wompi.co/l/6WXkiC',
    );
    expect(
      resolveGroundedWompiUrlForAmount(
        118_000,
        'https://checkout.wompi.co/l/x1dbS7',
      ),
    ).toBe('https://checkout.wompi.co/l/x1dbS7');
    expect(
      resolveGroundedWompiUrlForAmount(
        88_000,
        'https://evil.example/pay',
      ),
    ).toBeNull();
  });
});
