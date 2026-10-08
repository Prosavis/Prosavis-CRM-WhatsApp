import { describe, expect, it } from 'vitest';
import {
  hasBloqueadoTag,
  hasDeclineTag,
  hasRiskTag,
  isInternalContact,
  isTestContact,
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

describe('isInternalContact (metrics frontend)', () => {
  it('treats Equipo Prosavis like TEST', () => {
    expect(isInternalContact({ tags: ['Equipo Prosavis'] })).toBe(true);
    expect(isInternalContact({ tags: [' EQUIPO PROSAVIS '] })).toBe(true);
    expect(isInternalContact({ clientClassification: 'Agendado, Equipo Prosavis' })).toBe(true);
    expect(isInternalContact({ tags: ['TEST'] })).toBe(true);
  });

  it('ignores partial tokens', () => {
    expect(isInternalContact({ tags: ['Equipo', 'Prosavis'] })).toBe(false);
    expect(isInternalContact({ tags: ['Agendado'] })).toBe(false);
  });

  it('keeps isTestContact as the same broader check', () => {
    expect(isTestContact({ tags: ['Equipo Prosavis'] })).toBe(true);
    expect(isTestContact({ tags: ['TEST'] })).toBe(true);
    expect(isTestContact({ tags: [] })).toBe(false);
  });
});
