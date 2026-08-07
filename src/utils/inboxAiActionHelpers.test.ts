import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { InboxAiProposedAction } from '../../supabase/functions/_shared/inboxAiActions';
import {
  assertSuggestionNotStale,
  buildSuggestionFingerprint,
  canStartActionExecution,
  mergeTagIds,
  normalizeTagNameForMatch,
  prepareConfirmedInboxAiActionFingerprints,
  resolveGroundedWompiUrlForAmount,
  shouldApplyInboxAiActionUiEffects,
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

describe('prepareConfirmedInboxAiActionFingerprints', () => {
  it('calls assertSuggestionNotStale and rejects stale pairs before execute', () => {
    expect(() => prepareConfirmedInboxAiActionFingerprints({
      capturedFingerprint: 'fp_old',
      currentFingerprint: 'fp_new',
    })).toThrow(/stale/i);
  });

  it('returns both fingerprints when the captured suggestion is still current', () => {
    expect(prepareConfirmedInboxAiActionFingerprints({
      capturedFingerprint: 'fp_abc',
      currentFingerprint: 'fp_abc',
    })).toEqual({
      suggestionFingerprint: 'fp_abc',
      currentSuggestionFingerprint: 'fp_abc',
    });
  });
});

describe('shouldApplyInboxAiActionUiEffects', () => {
  it('applies UI effects only while the captured fingerprint is still current', () => {
    expect(shouldApplyInboxAiActionUiEffects('fp_1', 'fp_1')).toBe(true);
    expect(shouldApplyInboxAiActionUiEffects('fp_1', 'fp_2')).toBe(false);
    expect(shouldApplyInboxAiActionUiEffects('fp_1', null)).toBe(false);
    expect(shouldApplyInboxAiActionUiEffects(null, 'fp_2')).toBe(true);
  });
});

describe('stale-assert wiring (source-sensitive)', () => {
  it('wires assertSuggestionNotStale inside prepareConfirmedInboxAiActionFingerprints', () => {
    const source = readFileSync(
      resolve(
        __dirname,
        '../../supabase/functions/_shared/inboxAiActionHelpers.ts',
      ),
      'utf8',
    );
    const prepareBlock = source.slice(
      source.indexOf('export function prepareConfirmedInboxAiActionFingerprints'),
      source.indexOf('export function shouldApplyInboxAiActionUiEffects'),
    );
    expect(prepareBlock).toMatch(/assertSuggestionNotStale\s*\(/);
  });

  it('wires assertSuggestionNotStale inside executeInboxAiAction when fingerprint is present', () => {
    const source = readFileSync(
      resolve(
        __dirname,
        '../../supabase/functions/_shared/inboxAiActionExecution.ts',
      ),
      'utf8',
    );
    const executeStart = source.indexOf('export async function executeInboxAiAction');
    expect(executeStart).toBeGreaterThanOrEqual(0);
    const executeBlock = source.slice(executeStart, executeStart + 900);
    expect(executeBlock).toMatch(/if\s*\(\s*suggestionFingerprint\s*\)/);
    expect(executeBlock).toMatch(/assertSuggestionNotStale\s*\(/);
  });

  it('wires prepareConfirmed + shouldApply guards in ChatArea confirm handler', () => {
    const source = readFileSync(
      resolve(__dirname, '../components/whatsapp/ChatArea.tsx'),
      'utf8',
    );
    expect(source).toMatch(/prepareConfirmedInboxAiActionFingerprints\s*\(/);
    expect(source).toMatch(/shouldApplyInboxAiActionUiEffects\s*\(/);
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
