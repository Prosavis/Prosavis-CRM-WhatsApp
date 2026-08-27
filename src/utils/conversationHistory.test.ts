import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TRANSCRIPT_CHAR_BUDGET,
  applyTranscriptCharBudget,
  buildMergedTurns,
  buildTranscriptWithBudget,
  getConversationHistoryWithMeta,
  mergedTurnsToTranscript,
  type ConversationTurn,
} from '../../supabase/functions/_shared/conversationHistory';

describe('getConversationHistoryWithMeta', () => {
  it('probes limit plus one and returns only the newest limited window as truncated', async () => {
    const rows = [
      {
        direction: 'outbound',
        message_body: 'más reciente',
        created_at: '2026-08-06T12:03:00.000Z',
      },
      {
        direction: 'inbound',
        message_body: 'reciente',
        created_at: '2026-08-06T12:02:00.000Z',
      },
      {
        direction: 'outbound',
        message_body: 'anterior',
        created_at: '2026-08-06T12:01:00.000Z',
      },
      {
        direction: 'inbound',
        message_body: 'fuera de ventana',
        created_at: '2026-08-06T12:00:00.000Z',
      },
    ];
    let requestedLimit: number | null = null;
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit(value: number) {
        requestedLimit = value;
        return Promise.resolve({ data: rows.slice(0, value), error: null });
      },
    };
    const supabase = { from: () => query };

    const result = await getConversationHistoryWithMeta(
      supabase,
      '573001112233',
      3,
    );

    expect(requestedLimit).toBe(4);
    expect(result.turns.map((turn) => turn.text)).toEqual([
      'anterior',
      'reciente',
      'más reciente',
    ]);
    expect(result.meta).toMatchObject({
      loaded: 3,
      truncated: true,
      oldestAt: '2026-08-06T12:01:00.000Z',
      newestAt: '2026-08-06T12:03:00.000Z',
    });
  });

  it('replaces the [audio] placeholder with the voice transcription when enabled', async () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => Promise.resolve({
        data: [{
          direction: 'inbound',
          message_body: '[audio]',
          caption: '',
          media_type: 'audio',
          voice_transcription:
            'ya tengo personas acá que me están ayudando, ya dejemos así y la otra semana retomo',
          hidden_from_panel: false,
          created_at: '2026-08-12T16:15:09.000Z',
        }],
        error: null,
      }),
    };
    const result = await getConversationHistoryWithMeta(
      { from: () => query },
      '573146283332',
      10,
      { includeVoiceTranscriptions: true },
    );

    expect(result.turns).toHaveLength(1);
    expect(result.turns[0]?.text).toMatch(/^\[Audio transcrito\]:/);
    expect(result.turns[0]?.text).toContain('ya tengo personas acá');
    expect(result.turns[0]?.text).not.toBe('[audio]');
  });

  it('replaces the [image] placeholder with cached analysis when enabled', async () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => Promise.resolve({
        data: [{
          direction: 'inbound',
          message_body: '[image]',
          caption: 'sala',
          media_type: 'image',
          media_analysis_text: 'Sala con sofá y manchas en el piso.',
          created_at: '2026-08-27T13:00:00.000Z',
        }],
        error: null,
      }),
    };
    const result = await getConversationHistoryWithMeta(
      { from: () => query },
      '573001112233',
      10,
      { includeImageAnalysis: true },
    );

    expect(result.turns[0]?.text).toContain('[Imagen]:');
    expect(result.turns[0]?.text).toContain('Sala con sofá');
    expect(result.turns[0]?.text).toContain('sala');
  });

  it('keeps the [image] placeholder when image analysis is disabled', async () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => Promise.resolve({
        data: [{
          direction: 'inbound',
          message_body: '[image]',
          media_type: 'image',
          media_analysis_text: 'no debe entrar',
          created_at: '2026-08-27T13:00:00.000Z',
        }],
        error: null,
      }),
    };
    const result = await getConversationHistoryWithMeta(
      { from: () => query },
      '573001112233',
      10,
      { includeImageAnalysis: false },
    );

    expect(result.turns[0]?.text).toBe('[image]');
  });

  it('keeps the [audio] placeholder when transcriptions are disabled', async () => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => Promise.resolve({
        data: [{
          direction: 'inbound',
          message_body: '[audio]',
          media_type: 'audio',
          voice_transcription: 'texto que no debe entrar',
          created_at: '2026-08-12T16:15:09.000Z',
        }],
        error: null,
      }),
    };
    const result = await getConversationHistoryWithMeta(
      { from: () => query },
      '573146283332',
      10,
      { includeVoiceTranscriptions: false },
    );

    expect(result.turns[0]?.text).toBe('[audio]');
  });
});

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

  it('preserves the newest valid timestamp when a merged turn has an invalid timestamp', () => {
    const turns: ConversationTurn[] = [
      {
        role: 'user',
        text: 'Primero',
        createdAt: '2026-08-05T10:00:00.000Z',
      },
      {
        role: 'user',
        text: 'Segundo',
        createdAt: 'invalid',
      },
    ];

    expect(buildMergedTurns(turns)[0]?.createdAt).toBe(
      '2026-08-05T10:00:00.000Z',
    );
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

  it('retains complete merged turns separately before character truncation', () => {
    const turns: ConversationTurn[] = [
      {
        role: 'user',
        text: 'mensaje inbound anterior',
        createdAt: '2026-08-05T10:00:00.000Z',
      },
      {
        role: 'bot',
        text: 'respuesta saliente muy larga '.repeat(10),
        createdAt: '2026-08-05T11:00:00.000Z',
      },
    ];

    const result = buildTranscriptWithBudget(
      turns,
      { loaded: 2, truncated: false },
      60,
    );

    expect(result.merged).toHaveLength(1);
    expect(result.merged[0]?.role).toBe('bot');
    expect(result.completeMerged).toHaveLength(2);
    expect(result.completeMerged[0]).toMatchObject({
      role: 'user',
      createdAt: '2026-08-05T10:00:00.000Z',
    });
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
