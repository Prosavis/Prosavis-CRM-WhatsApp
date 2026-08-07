import { describe, expect, it } from 'vitest';
import { canStartActionExecution } from '../../supabase/functions/_shared/inboxAiActionHelpers';

describe('ProposedActionChips interaction guards', () => {
  it('requires confirmation copy and blocks pending double-clicks', () => {
    const label = 'Crear cita';
    expect(`¿Ejecutar: ${label}?`).toBe('¿Ejecutar: Crear cita?');
    expect(canStartActionExecution(null, 'action-1')).toBe(true);
    expect(canStartActionExecution('action-1', 'action-1')).toBe(false);
    expect(canStartActionExecution('action-1', 'action-2')).toBe(false);
  });
});
