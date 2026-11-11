import { describe, expect, it } from 'vitest';
import { buildInternalNotesSummary } from '../../supabase/functions/_shared/internalNotesSummary';

describe('buildInternalNotesSummary', () => {
  it('keeps the current block and the last three diary entries', () => {
    const notes = [
      '[Vigente 2026-11-01] Prefiere mañanas.',
      '## Diario',
      '### 2026-08-01',
      'Primera',
      '### 2026-09-01',
      'Segunda',
      '### 2026-10-01',
      'Tercera',
      '### 2026-11-01',
      'Cuarta',
    ].join('\n');

    const summary = buildInternalNotesSummary(notes);
    expect(summary).toContain('[Vigente 2026-11-01] Prefiere mañanas.');
    expect(summary).toContain('### 2026-09-01');
    expect(summary).toContain('### 2026-11-01');
    expect(summary).not.toContain('### 2026-08-01');
  });

  it('returns null for empty notes', () => {
    expect(buildInternalNotesSummary('   ')).toBeNull();
  });
});
