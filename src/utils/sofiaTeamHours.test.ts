import { describe, expect, it } from 'vitest';
import { bridgeGreeting, teamIsInOffice } from '../../supabase/functions/_shared/sofiaTeamHours';

const at = (iso: string) => new Date(iso);

describe('teamIsInOffice', () => {
  it('is in the office on a weekday between 8:00 and 18:00 Bogota', () => {
    expect(teamIsInOffice(at('2026-11-19T13:00:00Z'))).toBe(true);
    expect(teamIsInOffice(at('2026-11-19T22:59:00Z'))).toBe(true);
  });

  it('is out before 8:00, after 18:00, and all weekend', () => {
    expect(teamIsInOffice(at('2026-11-19T12:59:00Z'))).toBe(false);
    expect(teamIsInOffice(at('2026-11-19T23:00:00Z'))).toBe(false);
    expect(teamIsInOffice(at('2026-11-21T15:00:00Z'))).toBe(false);
  });

  it('is out on a public holiday even on a weekday', () => {
    expect(teamIsInOffice(at('2026-12-08T15:00:00Z'))).toBe(false);
  });
});

describe('bridgeGreeting', () => {
  it('greets by the time of day', () => {
    expect(bridgeGreeting(at('2026-11-21T13:00:00Z'))).toMatch(/^Buenos días/);
    expect(bridgeGreeting(at('2026-11-21T18:00:00Z'))).toMatch(/^Buenas tardes/);
    expect(bridgeGreeting(at('2026-11-21T02:00:00Z'))).toMatch(/^Buenas noches/);
  });
});
