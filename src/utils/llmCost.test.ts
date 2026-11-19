import { describe, expect, it } from 'vitest';
import { llmCostUsd } from '../../supabase/functions/_shared/llmCost.mjs';

describe('llmCostUsd', () => {
  it('prices a Sonnet call from the published list rates', () => {
    expect(llmCostUsd('anthropic', 1_000_000, 0)).toBe(3);
    expect(llmCostUsd('anthropic', 0, 1_000_000)).toBe(15);
    expect(llmCostUsd('anthropic', 1000, 500)).toBe(0.0105);
  });

  it('prices Gemini with the same rates as the card mold', () => {
    expect(llmCostUsd('google', 1_000_000, 1_000_000)).toBe(4.5);
  });

  it('records an unknown provider as zero', () => {
    expect(llmCostUsd('otro', 5000, 5000)).toBe(0);
  });
});
