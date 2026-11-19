import { describe, expect, it } from 'vitest';
import { normalizeDiagnosis } from '../../supabase/functions/_shared/sofiaDiagnose.mjs';

describe('normalizeDiagnosis', () => {
  const complete = {
    flujos: ['cotizacion', 'inventado'],
    etapa: 'propuesta',
    errores: ['tuteo'],
    funciono: 'Ofreció 4 horas.',
    mejora: 'Hablar de usted.',
    siguiente_accion: 'Confirmar la dirección.',
    sofia_puede_tomar_control: false,
    motivo_control: 'Tuté.',
    etiquetas: ['hogar'],
  };

  it('keeps catalog values and drops the rest', () => {
    const note = normalizeDiagnosis(complete);
    expect(note.flujos).toEqual(['cotizacion']);
    expect(note.errores).toEqual(['tuteo']);
    expect(note.bien).toBe('Ofreció 4 horas.');
    expect(note.mal).toBe('tuteo');
    expect(note.sofia_puede_tomar_control).toBe(false);
  });

  it('rejects a note without the required lines', () => {
    expect(() => normalizeDiagnosis({ ...complete, etapa: 'no-existe' })).toThrow('json');
    expect(() => normalizeDiagnosis({ ...complete, funciono: '  ' })).toThrow('json');
  });
});
