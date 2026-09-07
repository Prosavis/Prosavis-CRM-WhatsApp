import { describe, expect, it } from 'vitest';
import {
  hasBloqueadoTag,
  hasDeclineTag,
  hasRiskTag,
  qualityLayer,
} from './clientClassification';

describe('qualityLayer (metrics frontend)', () => {
  it('keeps risk above favorite on overlapping tags', () => {
    expect(
      qualityLayer(
        { tags: ['Favoritos', 'Cliente Problemática', 'Bloqueado'] },
        4,
      ),
    ).toBe('risk');
  });

  it('Lilian / Marii Duque: risk wins so favorite cannot coexist as layer', () => {
    expect(
      qualityLayer({ tags: ['Favoritos', 'Cliente Problemática'] }, 9),
    ).toBe('risk');
    expect(qualityLayer({ tags: ['Favoritos', 'Decline'] }, 6)).toBe('risk');
  });

  it('reads clientClassification as well as tags', () => {
    expect(
      qualityLayer(
        { clientClassification: 'Decline, Bloqueado' },
        1,
      ),
    ).toBe('risk');
    expect(hasDeclineTag({ clientClassification: 'Decline' })).toBe(true);
    expect(hasBloqueadoTag({ classification: 'Bloqueado' })).toBe(true);
    expect(hasRiskTag({ tags: ['🚫'] })).toBe(true);
  });

  it('marks behavioral recurrence without a quality tag', () => {
    expect(qualityLayer({ tags: [] }, 2)).toBe('recurring');
    expect(qualityLayer({ tags: [] }, 1)).toBe('standard');
  });
});
