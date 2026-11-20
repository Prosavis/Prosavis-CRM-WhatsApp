import { describe, expect, it } from 'vitest';
import {
  formatDemandSeasonLines,
  selectDemandSeason,
} from '../../supabase/functions/_shared/demandSeasons';

function at(ymd: string): string {
  return `${ymd}T15:00:00.000Z`;
}

function label(ymd: string, city?: string | null): string | null {
  return selectDemandSeason(at(ymd), city)?.label ?? null;
}

describe('selectDemandSeason', () => {
  it('names diciembre on 20 Nov 2026 with no city', () => {
    expect(label('2026-11-20')).toBe('temporada de diciembre');
    expect(label('2026-11-01')).toBe('temporada de diciembre');
    expect(label('2026-12-23')).toBe('temporada de diciembre');
    expect(label('2026-12-24')).toBeNull();
  });

  it('names the local feria on 1 Aug 2026 and keeps Dosquebradas with Pereira', () => {
    expect(label('2026-08-01', 'Cartago')).toBe('Feria de Cartago');
    expect(label('2026-08-01', 'Pereira')).toBe('Fiestas de la Cosecha');
    expect(label('2026-08-01', 'Dosquebradas')).toBe('Fiestas de la Cosecha');
    expect(label('2026-08-01', 'Cerritos')).toBe('Fiestas de la Cosecha');
    expect(label('2026-08-01')).toBeNull();
  });

  it('names Semana Santa on 10 Mar 2026', () => {
    expect(label('2026-03-10')).toBe('Semana Santa');
    expect(label('2026-03-05')).toBe('Semana Santa');
    expect(label('2026-03-31')).toBe('Semana Santa');
    expect(label('2026-04-01')).toBeNull();
  });

  it('names Mother’s Day on 1 May and mid-year vacation on 20 May, not Father’s Day', () => {
    expect(label('2026-05-01')).toBe('Día de la Madre');
    expect(label('2026-05-20')).toBe('vacaciones de mitad de año');
    expect(label('2026-06-10')).toBe('vacaciones de mitad de año');
    expect(selectDemandSeason(at('2026-06-10'))?.phrase ?? '').not.toMatch(/padre/i);
    expect(label('2026-06-21')).toBeNull();
  });

  it('names Amor y Amistad before Araucarias, then the local feria', () => {
    expect(label('2026-09-05', 'Pereira')).toBe('Amor y Amistad');
    expect(label('2026-09-12', 'Santa Rosa de Cabal')).toBe('Amor y Amistad');
    expect(label('2026-09-20', 'Santa Rosa de Cabal')).toBe('Fiestas de las Araucarias');
    expect(label('2026-09-21', 'Pereira')).toBe('receso escolar de octubre');
  });

  it('names nothing on 10 Feb 2026', () => {
    expect(label('2026-02-10')).toBeNull();
    expect(label('2026-02-10', 'Pereira')).toBeNull();
    expect(formatDemandSeasonLines(at('2026-02-10')).join('\n')).toMatch(
      /Ninguna temporada próxima/,
    );
  });

  it('keeps each season blurb inside the context budget', () => {
    const samples: Array<[string, string | null]> = [
      ['2026-11-20', null],
      ['2026-08-01', 'Cartago'],
      ['2026-08-01', 'Pereira'],
      ['2026-03-10', null],
      ['2026-09-20', 'Santa Rosa de Cabal'],
      ['2026-02-10', null],
    ];
    for (const [ymd, city] of samples) {
      const text = ['=== Temporada próxima ===', ...formatDemandSeasonLines(at(ymd), city)].join('\n');
      expect(text.length, `${ymd} ${city ?? 'sin ciudad'}`).toBeLessThanOrEqual(500);
    }
  });
});
