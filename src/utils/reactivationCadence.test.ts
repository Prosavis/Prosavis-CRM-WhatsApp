/**
 * Espejo ligero de la lógica de gaps del worker Deno
 * (_shared/reactivationCadence.ts) para validar la cadencia sin Deno.
 */

import { describe, expect, it } from 'vitest';
import {
  REACTIVATION_STEPS,
  buildDisplayBody,
  getStepDef,
} from '../../supabase/functions/_shared/reactivationCadence';

const STEPS = [
  { step: 1, gapDaysFromPrevious: 0 },
  { step: 2, gapDaysFromPrevious: 7 },
  { step: 3, gapDaysFromPrevious: 7 },
  { step: 4, gapDaysFromPrevious: 14 },
  { step: 5, gapDaysFromPrevious: 28 },
  { step: 6, gapDaysFromPrevious: 28 },
];

function nextStepNumber(currentStep: number): number | null {
  if (currentStep < 1) return 1;
  if (currentStep >= 6) return null;
  return currentStep + 1;
}

function resolveDueStep(params: {
  sequenceStep: number;
  daysSinceLastContact: number | null;
}): number | null {
  const next = nextStepNumber(params.sequenceStep);
  if (!next) return null;
  const def = STEPS.find((s) => s.step === next);
  if (!def) return null;
  if (next === 1) return 1;
  if (params.daysSinceLastContact == null) return next;
  if (params.daysSinceLastContact >= def.gapDaysFromPrevious) return next;
  return null;
}

describe('reactivation cadence gaps', () => {
  it('enrolls with step 1 when not in sequence', () => {
    expect(resolveDueStep({ sequenceStep: 0, daysSinceLastContact: null })).toBe(1);
  });

  it('waits 7 days between step 1 and 2', () => {
    expect(resolveDueStep({ sequenceStep: 1, daysSinceLastContact: 6 })).toBeNull();
    expect(resolveDueStep({ sequenceStep: 1, daysSinceLastContact: 7 })).toBe(2);
  });

  it('waits 14 days between step 3 and 4', () => {
    expect(resolveDueStep({ sequenceStep: 3, daysSinceLastContact: 13 })).toBeNull();
    expect(resolveDueStep({ sequenceStep: 3, daysSinceLastContact: 14 })).toBe(4);
  });

  it('waits 28 days for monthly steps', () => {
    expect(resolveDueStep({ sequenceStep: 4, daysSinceLastContact: 27 })).toBeNull();
    expect(resolveDueStep({ sequenceStep: 4, daysSinceLastContact: 28 })).toBe(5);
    expect(resolveDueStep({ sequenceStep: 5, daysSinceLastContact: 28 })).toBe(6);
  });

  it('stops after step 6', () => {
    expect(resolveDueStep({ sequenceStep: 6, daysSinceLastContact: 100 })).toBeNull();
  });

  it('totals ~84 days of enrollment cadence', () => {
    const total = STEPS.reduce((sum, s) => sum + s.gapDaysFromPrevious, 0);
    expect(total).toBe(84);
  });

  it('keeps the approved day 0 and day 7 template identifiers', () => {
    expect(REACTIVATION_STEPS[0]?.templateName).toBe('react_cliente_misma_profesional');
    expect(REACTIVATION_STEPS[1]?.templateName).toBe('rebooking_frecuencia');
  });

  it.each([1, 2])('shows the prepaid package promotion in step %i', (stepNumber) => {
    const step = getStepDef(stepNumber);
    expect(step).not.toBeNull();

    const body = buildDisplayBody('María', step!);

    expect(body).toContain('4 servicios');
    expect(body).toContain('$10.000');
    expect(body).toContain('$15.000');
    expect(body).toContain('$20.000');
    expect(body).toContain('pagar por anticipado');
    expect(body.toLowerCase()).not.toContain('misma profesional');
  });
});
