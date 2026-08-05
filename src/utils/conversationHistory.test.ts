import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSCRIPT_CHAR_BUDGET,
  applyTranscriptCharBudget,
  buildMergedTurns,
  buildTranscriptWithBudget,
  mergedTurnsToTranscript,
  type ConversationTurn,
} from '../../supabase/functions/_shared/conversationHistory';

describe('buildMergedTurns', () => {
  it('drops leading outbound until first inbound', () => {
    const turns: ConversationTurn[] = [
      { role: 'bot', text: 'Hola plantilla' },
      { role: 'user', text: 'Quiero agendar' },
      { role: 'bot', text: 'Claro' },
    ];
    const merged = buildMergedTurns(turns);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ role: 'user', text: 'Quiero agendar' });
  });

  it('merges consecutive same-role turns', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', text: 'Hola' },
      { role: 'user', text: '¿Precios?' },
      { role: 'bot', text: 'Desde 80k' },
    ];
    const merged = buildMergedTurns(turns);
    expect(merged).toHaveLength(2);
    expect(merged[0].text).toBe('Hola\n¿Precios?');
  });
});

describe('applyTranscriptCharBudget', () => {
  it('keeps full transcript under budget', () => {
    const merged: ConversationTurn[] = [
      { role: 'user', text: 'hola', createdAt: '2026-01-01T00:00:00Z' },
      { role: 'bot', text: 'ok', createdAt: '2026-01-01T00:01:00Z' },
    ];
    const result = applyTranscriptCharBudget(merged, 1000);
    expect(result.truncated).toBe(false);
    expect(result.transcript).toContain('Cliente: hola');
    expect(result.turns).toHaveLength(2);
  });

  it('truncates from oldest turns when over budget', () => {
    const merged: ConversationTurn[] = [
      { role: 'user', text: 'A'.repeat(40), createdAt: '2026-01-01T00:00:00Z' },
      { role: 'bot', text: 'B'.repeat(40), createdAt: '2026-01-01T00:01:00Z' },
      { role: 'user', text: 'reciente', createdAt: '2026-01-01T00:02:00Z' },
    ];
    const result = applyTranscriptCharBudget(merged, 50);
    expect(result.truncated).toBe(true);
    expect(result.transcript).toContain('reciente');
    expect(result.transcript).not.toContain('AAAA');
  });

  it('uses default budget constant', () => {
    expect(DEFAULT_TRANSCRIPT_CHAR_BUDGET).toBe(60_000);
  });
});

describe('buildTranscriptWithBudget', () => {
  it('preserves newest turn after merge + budget', () => {
    const turns: ConversationTurn[] = [
      { role: 'user', text: 'mensaje viejo largo '.repeat(8), createdAt: '2026-01-01T00:00:00Z' },
      { role: 'bot', text: 'respuesta intermedia', createdAt: '2026-01-01T00:01:00Z' },
      { role: 'user', text: 'nuevo mensaje', createdAt: '2026-01-01T00:02:00Z' },
    ];
    const { transcript, merged, meta } = buildTranscriptWithBudget(
      turns,
      { loaded: 3, truncated: false },
      80,
    );
    expect(transcript).toContain('nuevo');
    expect(merged[merged.length - 1]?.text).toContain('nuevo');
    expect(meta.truncated).toBe(true);
  });
});

describe('mergedTurnsToTranscript', () => {
  it('labels Cliente/Agente', () => {
    const text = mergedTurnsToTranscript([
      { role: 'user', text: 'hola' },
      { role: 'bot', text: 'buenas' },
    ]);
    expect(text).toBe('Cliente: hola\nAgente: buenas');
  });

  it('prefixes turn timestamps when createdAt is present', () => {
    const text = mergedTurnsToTranscript([
      {
        role: 'user',
        text: 'hola',
        createdAt: '2026-08-05T15:30:00.000Z',
      },
    ]);
    expect(text).toMatch(/^\[.+\] Cliente: hola$/);
    expect(text).toContain('Cliente: hola');
  });
});
