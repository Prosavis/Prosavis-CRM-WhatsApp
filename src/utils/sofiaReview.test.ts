import { describe, expect, it } from 'vitest';
import { normalizeReview } from '../../supabase/functions/_shared/sofiaReview.mjs';

describe('normalizeReview', () => {
  it('keeps a return verdict and trims the note', () => {
    const review = normalizeReview({
      veredicto: 'devolver',
      feedback: 'Pregunta la dirección.',
      contexto_faltante: 'Dirección',
    });
    expect(review.verdict).toBe('devolver');
    expect(review.feedback).toBe('Pregunta la dirección.');
  });

  it('treats an unknown verdict as a risk', () => {
    expect(normalizeReview({ veredicto: 'bloquear' }).verdict).toBe('riesgo');
  });
});
