import { describe, expect, it } from 'vitest';
import {
  applyCardDiff,
  blockedFieldViolations,
  closedValueProblems,
  copiesLiveFacts,
  evaluateMold,
  hasHealthData,
  phoneKey,
  sinCampoCandidates,
} from '../../scripts/sofia-card-checks.mjs';

describe('sofia card checks', () => {
  it('normalizes a phone and rejects open values', () => {
    expect(phoneKey('+57 300 111 2233')).toBe('573001112233');
    expect(closedValueProblems({
      tipo_contacto: { valor: 'hogar' },
      servicio: { duracion_habitual: { valor: 5 } },
    })).toEqual(['servicio.duracion_habitual:5']);
  });

  it('keeps a blocked field and flags a copied appointment or health note', () => {
    const current = { tipo_contacto: { valor: 'hogar', bloqueado: true } };
    const diff = { tipo_contacto: { valor: 'empresa' } };
    expect(blockedFieldViolations(current, diff)).toEqual(['tipo_contacto']);
    expect(applyCardDiff(current, diff).tipo_contacto.valor).toBe('hogar');
    expect(copiesLiveFacts(
      { pago: { medio_habitual: { valor: '2026-11-20T15:00:00.000Z' } } },
      [{ scheduledDate: '2026-11-20T15:00:00.000Z', price: 88000 }],
    )).toBe(true);
    expect(hasHealthData({ notas_internas: [{ valor: 'tiene diabetes' }] })).toBe(true);
  });

  it('names a repeated sin_campo and does not pass the human review early', () => {
    const cards = Array.from({ length: 6 }, () => ({ sin_campo: ['trae las llaves del edificio'] }));
    expect(sinCampoCandidates(cards)).toEqual([
      { tipo: 'trae las llaves', fichas: 6 },
    ]);
    expect(evaluateMold({
      closedProblems: 0,
      copied: 0,
      health: 0,
      blocked: 0,
      reviews: [{ phone: '57300', verdict: 'correcto' }],
      candidates: [],
    })).toMatchObject({ automaticPass: true, humanPass: false, reviewed: 1 });
  });
});
