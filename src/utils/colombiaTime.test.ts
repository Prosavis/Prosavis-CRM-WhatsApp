import { describe, expect, it } from 'vitest';
import {
  colombiaDateKey,
  formatColombiaDateLabel,
  formatRelativeColombiaTime,
  previousColombiaDateKey,
} from './colombiaTime';

describe('colombiaTime', () => {
  it('uses America/Bogota calendar days around UTC midnight', () => {
    const lateBogota = new Date('2026-08-28T04:20:00.000Z');
    expect(colombiaDateKey(lateBogota)).toBe('2026-08-27');
    expect(previousColombiaDateKey('2026-08-28')).toBe('2026-08-27');
  });

  it('labels today, yesterday and older dates in Colombia', () => {
    const now = new Date('2026-08-28T04:20:00.000Z');
    expect(formatRelativeColombiaTime(new Date('2026-08-28T03:05:00.000Z'), now)).toMatch(/22:05|10:05/);
    expect(formatRelativeColombiaTime(new Date('2026-08-27T04:00:00.000Z'), now)).toBe('Ayer');
    expect(formatColombiaDateLabel(new Date('2026-08-27T20:00:00.000Z'))).toMatch(/27/);
  });
});
