import { describe, expect, it } from 'vitest';
import { OFFICIAL_CONTACT_NUMBERS, scoreSuggestionRules } from '../../supabase/functions/_shared/suggestionRubric';

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

  it('accepts the extra hour on the 4 and 6 hour plans and rejects it on 8 hours', () => {
    const catalogWithExtra = [88000, 110000, 118000, 140000, 148000, 30000];
    const onFour = scoreSuggestionRules({
      suggestion: 'La hora adicional sobre las 4 horas queda en COP 110.000.',
      catalogAmounts: catalogWithExtra,
    });
    expect(onFour.violations).not.toContain('hora-adicional');

    const onEight = scoreSuggestionRules({
      suggestion: 'Sobre las 8 horas le sumo una hora adicional y queda en COP 170.000.',
      catalogAmounts: catalogWithExtra,
    });
    expect(onEight.violations).toContain('hora-adicional');
    expect(onEight.score).toBe(0);
  });

  it('records length, question count, tuteo and accounts outside the allow list', () => {
    const result = scoreSuggestionRules({
      suggestion:
        'Hola, te cuento que tu servicio queda listo y puedes escribirnos cuando quieras para coordinar todo con calma y sin afán, porque nos gusta dejarte cada detalle claro antes de empezar. ' +
        '¿Qué día te sirve? ¿En la mañana o en la tarde? ' +
        'Consigna a la cuenta 999000111.',
      allowedAccounts: ['123456789'],
    });
    expect(result.violations).toEqual(
      expect.arrayContaining(['largo', 'preguntas', 'tuteo', 'cuenta']),
    );
  });

  it('accepts a short usted reply that uses an allowed account', () => {
    const result = scoreSuggestionRules({
      suggestion: 'Buenas tardes. El servicio de 4 horas queda en COP 88.000. ¿Le agendo?',
      catalogAmounts: catalog,
      allowedAccounts: ['123456789'],
    });
    expect(result.violations).toEqual([]);
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

  it('allows the official Bancolombia account and rejects another one', () => {
    expect(OFFICIAL_CONTACT_NUMBERS).toContain('27000013673');
    const official = scoreSuggestionRules({
      suggestion: 'La cuenta de ahorros es 27000013673.',
      allowedAccounts: OFFICIAL_CONTACT_NUMBERS,
    });
    expect(official.violations).not.toContain('cuenta');
    const other = scoreSuggestionRules({
      suggestion: 'Consigna a la cuenta 12345678901.',
      allowedAccounts: OFFICIAL_CONTACT_NUMBERS,
    });
    expect(other.violations).toContain('cuenta');
  });
});
