import { describe, expect, it } from 'vitest';
import { normalizeTriage } from '../../supabase/functions/_shared/sofiaTriage.mjs';

describe('normalizeTriage', () => {
  it('keeps a known label', () => {
    expect(normalizeTriage({ label: 'util', motivo: 'comprobante' })).toEqual({
      label: 'util',
      motivo: 'comprobante',
    });
  });

  it('turns an unknown label into doubt', () => {
    expect(normalizeTriage({ label: 'borrar', motivo: '' }).label).toBe('duda');
  });
});
