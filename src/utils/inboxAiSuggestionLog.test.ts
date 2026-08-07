import { describe, expect, it, vi } from 'vitest';
import {
  buildSuggestionLogContextMeta,
  closeWhatsAppAiSuggestionLog,
  computeEditRatio,
  insertWhatsAppAiSuggestionLog,
  type SuggestionLogContextMeta,
} from '../../supabase/functions/_shared/inboxAiSuggestionLog';

describe('computeEditRatio', () => {
  it('returns 0 when suggestion and sent text are identical', () => {
    expect(computeEditRatio('Hola cliente', 'Hola cliente')).toBe(0);
  });

  it('returns ~1 when texts are completely different of equal length', () => {
    const ratio = computeEditRatio('aaaa', 'bbbb');
    expect(ratio).toBeGreaterThan(0.99);
    expect(ratio).toBeLessThanOrEqual(1);
  });

  it('returns 0 for two empty strings', () => {
    expect(computeEditRatio('', '')).toBe(0);
  });

  it('returns 1 when replacing empty with non-empty (or vice versa)', () => {
    expect(computeEditRatio('', 'abc')).toBe(1);
    expect(computeEditRatio('abc', '')).toBe(1);
  });

  it('returns a mid-range ratio for a single-character edit', () => {
    const ratio = computeEditRatio('hola', 'holi');
    expect(ratio).toBeCloseTo(0.25, 5);
  });
});

describe('buildSuggestionLogContextMeta', () => {
  it('packs historyMeta, tags, propertySummary, sessionWindow and action types', () => {
    const meta = buildSuggestionLogContextMeta({
      historyMeta: {
        loaded: 12,
        truncated: true,
        oldestAt: '2026-08-01T00:00:00.000Z',
        newestAt: '2026-08-05T00:00:00.000Z',
      },
      conversationTags: ['VIP', 'Lead'],
      propertySummary: {
        uniquePropertyCount: 1,
        pattern: 'single',
        patternLabel: 'Misma propiedad',
        properties: [{ address: 'Calle 1', reference: null, appointmentCount: 2 }],
        preferredDirectoryAddress: 'Calle 1',
        appointmentsWithoutAddress: 0,
      },
      sessionWindow: {
        status: 'open',
        lastInboundAt: '2026-08-05T10:00:00.000Z',
        expiresAt: '2026-08-06T10:00:00.000Z',
        requiresTemplate: false,
      },
      proposedActionTypes: ['apply_tag', 'send_payment_link'],
    });

    expect(meta.historyMeta).toEqual({
      loaded: 12,
      truncated: true,
      oldestAt: '2026-08-01T00:00:00.000Z',
      newestAt: '2026-08-05T00:00:00.000Z',
    });
    expect(meta.conversationTags).toEqual(['VIP', 'Lead']);
    expect(meta.propertySummary?.pattern).toBe('single');
    expect(meta.propertySummary?.uniquePropertyCount).toBe(1);
    expect(meta.sessionWindow.status).toBe('open');
    expect(meta.sessionWindow.requiresTemplate).toBe(false);
    expect(meta.proposedActionTypes).toEqual(['apply_tag', 'send_payment_link']);
    const _typed: SuggestionLogContextMeta = meta;
    expect(_typed.conversationTags).toHaveLength(2);
  });
});

describe('insertWhatsAppAiSuggestionLog', () => {
  it('inserts a row and returns the new id', async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: { id: 'log-uuid-1' },
            error: null,
          }),
      }),
    });
    const supabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe('whatsapp_ai_suggestion_log');
        return { insert };
      }),
    };

    const id = await insertWhatsAppAiSuggestionLog(supabase, {
      stableKey: '573001112233',
      suggestion: 'Hola',
      model: 'gemini-3.6-flash',
      contextMeta: {
        historyMeta: { loaded: 1, truncated: false },
        conversationTags: [],
        propertySummary: null,
        sessionWindow: {
          status: 'unknown',
          lastInboundAt: null,
          expiresAt: null,
          requiresTemplate: true,
        },
        proposedActionTypes: [],
      },
      createdBy: 'user-1',
    });

    expect(id).toBe('log-uuid-1');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        stable_key: '573001112233',
        suggestion: 'Hola',
        model: 'gemini-3.6-flash',
        created_by: 'user-1',
      }),
    );
  });

  it('returns null when insert fails without throwing', async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({
            data: null,
            error: { message: 'boom' },
          }),
      }),
    });
    const supabase = { from: () => ({ insert }) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const id = await insertWhatsAppAiSuggestionLog(supabase, {
      stableKey: 'k',
      suggestion: 'x',
      model: null,
      contextMeta: {
        historyMeta: { loaded: 0, truncated: false },
        conversationTags: [],
        propertySummary: null,
        sessionWindow: {
          status: 'unknown',
          lastInboundAt: null,
          expiresAt: null,
          requiresTemplate: true,
        },
        proposedActionTypes: [],
      },
      createdBy: null,
    });

    expect(id).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('closeWhatsAppAiSuggestionLog', () => {
  it('sets sent_text, edit_ratio, closed_at and optional action_taken', async () => {
    const update = vi.fn().mockReturnValue({
      eq: () => ({
        is: () =>
          Promise.resolve({
            data: null,
            error: null,
          }),
      }),
    });
    const supabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe('whatsapp_ai_suggestion_log');
        return { update };
      }),
    };

    const result = await closeWhatsAppAiSuggestionLog(supabase, {
      suggestionLogId: 'log-1',
      suggestion: 'Hola mundo',
      sentText: 'Hola mundo',
      actionTaken: 'send_text',
    });

    expect(result).toEqual({ ok: true, editRatio: 0 });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        sent_text: 'Hola mundo',
        edit_ratio: 0,
        action_taken: 'send_text',
        closed_at: expect.any(String),
      }),
    );
  });

  it('returns ok:false when update errors', async () => {
    const update = vi.fn().mockReturnValue({
      eq: () => ({
        is: () =>
          Promise.resolve({
            data: null,
            error: { message: 'denied' },
          }),
      }),
    });
    const supabase = { from: () => ({ update }) };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await closeWhatsAppAiSuggestionLog(supabase, {
      suggestionLogId: 'log-1',
      suggestion: 'a',
      sentText: 'b',
    });

    expect(result.ok).toBe(false);
    warn.mockRestore();
  });

  it('loads suggestion from the open log row when closing by id', async () => {
    const { closeWhatsAppAiSuggestionLogById } = await import(
      '../../supabase/functions/_shared/inboxAiSuggestionLog'
    );
    const update = vi.fn().mockReturnValue({
      eq: () => ({
        is: () => Promise.resolve({ data: null, error: null }),
      }),
    });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'log-1', suggestion: 'Original', closed_at: null },
      error: null,
    });
    const supabase = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle,
            }),
          }),
        }),
        update,
      })),
    };

    const result = await closeWhatsAppAiSuggestionLogById(supabase, {
      suggestionLogId: 'log-1',
      sentText: 'Original',
      actionTaken: 'send_text',
    });

    expect(result).toEqual({ ok: true, editRatio: 0 });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        sent_text: 'Original',
        edit_ratio: 0,
        action_taken: 'send_text',
      }),
    );
  });
});
