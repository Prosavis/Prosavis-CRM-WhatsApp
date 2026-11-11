import { describe, expect, it } from 'vitest';
import { scoreSuggestionRules } from '../../supabase/functions/_shared/suggestionRubric';

const catalog = [68000, 88000, 108000, 30000];

describe('scoreSuggestionRules', () => {
  it('accepts a reply that follows the fixed rules', () => {
    const result = scoreSuggestionRules({
      suggestion: 'Hola Ana, el servicio de 4 horas queda en COP 88.000. El Kit de limpieza Prosavis es opcional.',
      catalogAmounts: catalog,
      allowedSlots: ['2026-11-12T14:00:00.000Z'],
      forbiddenNames: ['Laura Gómez'],
    });
    expect(result.violations).toEqual([]);
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it('scores zero when a fixed rule is broken', () => {
    const result = scoreSuggestionRules({
      suggestion: 'Te dejo con la misma auxiliar Laura Gómez y el Kit profesional por COP 50.000 a las 7:15 a. m.',
      catalogAmounts: catalog,
      allowedSlots: ['2026-11-12T14:00:00.000Z'],
      forbiddenNames: ['Laura Gómez'],
    });
    expect(result.score).toBe(0);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});
