import { describe, expect, it } from 'vitest';
import { suggestionDraftBlocked } from '../../supabase/functions/_shared/inboxAiSuggestConfig';

describe('suggestionDraftBlocked', () => {
  it('blocks the draft when the v1 prompt is on and the appointments failed to load', () => {
    expect(
      suggestionDraftBlocked({ sofiaPrompt: true, appointmentsLoadFailed: true }),
    ).toBe(true);
  });

  it('keeps drafting with the current prompt, and when the appointments loaded', () => {
    expect(
      suggestionDraftBlocked({ sofiaPrompt: false, appointmentsLoadFailed: true }),
    ).toBe(false);
    expect(
      suggestionDraftBlocked({ sofiaPrompt: true, appointmentsLoadFailed: false }),
    ).toBe(false);
  });
});
