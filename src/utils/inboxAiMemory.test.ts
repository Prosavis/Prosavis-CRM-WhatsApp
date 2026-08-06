import { describe, expect, it, vi } from 'vitest';
import {
  INBOX_AI_MEMORY_REFRESH_MESSAGE_THRESHOLD,
  loadOrRefreshInboxAiMemory,
  normalizeInboxAiMemoryJson,
  shouldRefreshInboxAiMemory,
  type InboxAiMemory,
} from '../../supabase/functions/_shared/inboxAiMemory';

type Row = Record<string, unknown>;

function createMemorySupabaseDouble(params: {
  memory?: Row | null;
  totalVisible?: number;
  newVisible?: number;
  readError?: Error;
  countError?: Error;
  upsertError?: Error;
}) {
  const calls: Array<{
    table: string;
    method: string;
    args: unknown[];
  }> = [];
  const upserts: Row[] = [];

  return {
    calls,
    upserts,
    client: {
      from(table: string) {
        const filters: Array<[string, unknown]> = [];
        let hasMarkerFilter = false;
        const query = {
          select(...args: unknown[]) {
            calls.push({ table, method: 'select', args });
            return query;
          },
          eq(column: string, value: unknown) {
            calls.push({ table, method: 'eq', args: [column, value] });
            filters.push([column, value]);
            return query;
          },
          gt(column: string, value: unknown) {
            calls.push({ table, method: 'gt', args: [column, value] });
            hasMarkerFilter = true;
            return query;
          },
          maybeSingle() {
            calls.push({ table, method: 'maybeSingle', args: [] });
            return Promise.resolve({
              data: params.readError ? null : params.memory ?? null,
              error: params.readError ?? null,
            });
          },
          upsert(payload: Row, options: unknown) {
            calls.push({ table, method: 'upsert', args: [payload, options] });
            upserts.push(payload);
            return Promise.resolve({
              data: null,
              error: params.upsertError ?? null,
            });
          },
          then(
            resolve: (value: {
              data: null;
              count: number | null;
              error: Error | null;
            }) => unknown,
          ) {
            expect(filters).toContainEqual(['hidden_from_panel', false]);
            return Promise.resolve({
              data: null,
              count: params.countError
                ? null
                : hasMarkerFilter
                  ? params.newVisible ?? 0
                  : params.totalVisible ?? 0,
              error: params.countError ?? null,
            }).then(resolve);
          },
        };
        return query;
      },
    },
  };
}

const priorMemory: InboxAiMemory = {
  stableKey: '573001112233',
  summary: 'Cliente recurrente',
  preferences: ['Tarde'],
  objections: ['Precio'],
  agreements: ['Confirmar viernes'],
  lastSummarizedMessageAt: '2026-08-01T10:00:00.000Z',
  messageCount: 20,
  model: 'gemini-3.6-flash',
  updatedAt: '2026-08-01T10:01:00.000Z',
};

const priorMemoryRow: Row = {
  stable_key: priorMemory.stableKey,
  summary: priorMemory.summary,
  preferences: priorMemory.preferences,
  objections: priorMemory.objections,
  agreements: priorMemory.agreements,
  last_summarized_message_at: priorMemory.lastSummarizedMessageAt,
  message_count: priorMemory.messageCount,
  model: priorMemory.model,
  updated_at: priorMemory.updatedAt,
};

describe('normalizeInboxAiMemoryJson', () => {
  it('keeps only unique, non-empty strings from Gemini JSON', () => {
    expect(normalizeInboxAiMemoryJson({
      summary: '  Cliente recurrente  ',
      preferences: [' Tardes ', '', 'tardes', 7, null],
      objections: ['Precio', ' PRECIO ', false],
      agreements: ['Confirmar el viernes', 'confirmar el viernes'],
    })).toEqual({
      summary: 'Cliente recurrente',
      preferences: ['Tardes'],
      objections: ['Precio'],
      agreements: ['Confirmar el viernes'],
    });
  });
});

describe('shouldRefreshInboxAiMemory', () => {
  it('refreshes at the exact 20-message threshold with or without prior memory', () => {
    expect(INBOX_AI_MEMORY_REFRESH_MESSAGE_THRESHOLD).toBe(20);
    expect(shouldRefreshInboxAiMemory({
      hasMemory: false,
      newVisibleMessageCount: 20,
      historyTruncated: false,
    })).toBe(true);
    expect(shouldRefreshInboxAiMemory({
      hasMemory: true,
      newVisibleMessageCount: 20,
      historyTruncated: false,
    })).toBe(true);
  });

  it('refreshes truncated history even below the threshold', () => {
    expect(shouldRefreshInboxAiMemory({
      hasMemory: true,
      newVisibleMessageCount: 1,
      historyTruncated: true,
    })).toBe(true);
  });

  it('does not refresh below the threshold when history is complete', () => {
    expect(shouldRefreshInboxAiMemory({
      hasMemory: false,
      newVisibleMessageCount: 19,
      historyTruncated: false,
    })).toBe(false);
    expect(shouldRefreshInboxAiMemory({
      hasMemory: true,
      newVisibleMessageCount: 0,
      historyTruncated: false,
    })).toBe(false);
    expect(shouldRefreshInboxAiMemory({
      hasMemory: true,
      newVisibleMessageCount: 0,
      historyTruncated: true,
    })).toBe(false);
  });
});

describe('loadOrRefreshInboxAiMemory', () => {
  it('does not call Gemini or upsert below the threshold', async () => {
    const supabase = createMemorySupabaseDouble({
      memory: priorMemoryRow,
      totalVisible: 39,
      newVisible: 19,
    });
    const generateJson = vi.fn();

    await expect(loadOrRefreshInboxAiMemory({
      supabase: supabase.client,
      stableKey: priorMemory.stableKey,
      transcript: 'Cliente: Hola',
      historyMeta: {
        loaded: 2,
        truncated: false,
        newestAt: '2026-08-05T12:00:00.000Z',
      },
      dependencies: {
        getApiKey: () => 'test-key',
        resolveModel: () => 'memory-model',
        generateJson,
      },
    })).resolves.toEqual(priorMemory);

    expect(generateJson).not.toHaveBeenCalled();
    expect(supabase.upserts).toHaveLength(0);
    expect(supabase.calls).toContainEqual({
      table: 'whatsapp_message_log',
      method: 'gt',
      args: ['created_at', priorMemory.lastSummarizedMessageAt],
    });
    expect(supabase.calls.filter((call) =>
      call.table === 'whatsapp_message_log' && call.method === 'select'
    )).toHaveLength(1);
  });

  it('uses one total count when no prior memory exists', async () => {
    const supabase = createMemorySupabaseDouble({
      memory: null,
      totalVisible: 19,
    });
    const generateJson = vi.fn();

    await expect(loadOrRefreshInboxAiMemory({
      supabase: supabase.client,
      stableKey: priorMemory.stableKey,
      transcript: 'Cliente: Hola',
      historyMeta: { loaded: 19, truncated: false },
      dependencies: {
        getApiKey: () => 'test-key',
        resolveModel: () => 'memory-model',
        generateJson,
      },
    })).resolves.toBeNull();

    expect(supabase.calls.filter((call) =>
      call.table === 'whatsapp_message_log' && call.method === 'select'
    )).toHaveLength(1);
    expect(supabase.calls.some((call) =>
      call.table === 'whatsapp_message_log' && call.method === 'gt'
    )).toBe(false);
    expect(generateJson).not.toHaveBeenCalled();
  });

  it('does not refresh truncated history again when no visible message progressed', async () => {
    const supabase = createMemorySupabaseDouble({
      memory: priorMemoryRow,
      totalVisible: 20,
      newVisible: 0,
    });
    const generateJson = vi.fn();

    await expect(loadOrRefreshInboxAiMemory({
      supabase: supabase.client,
      stableKey: priorMemory.stableKey,
      transcript: 'Cliente: mismo historial truncado',
      historyMeta: {
        loaded: 20,
        truncated: true,
        newestAt: priorMemory.lastSummarizedMessageAt ?? undefined,
      },
      dependencies: {
        getApiKey: () => 'test-key',
        resolveModel: () => 'memory-model',
        generateJson,
      },
    })).resolves.toEqual(priorMemory);

    const countSelects = supabase.calls.filter((call) =>
      call.table === 'whatsapp_message_log' && call.method === 'select'
    );
    expect(countSelects).toHaveLength(1);
    expect(generateJson).not.toHaveBeenCalled();
    expect(supabase.upserts).toHaveLength(0);
  });

  it('fails open and preserves prior memory when Gemini fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const supabase = createMemorySupabaseDouble({
      memory: priorMemoryRow,
      totalVisible: 40,
      newVisible: 20,
    });
    const generateJson = vi.fn().mockRejectedValue(new Error('Gemini unavailable'));

    await expect(loadOrRefreshInboxAiMemory({
      supabase: supabase.client,
      stableKey: priorMemory.stableKey,
      transcript: 'Cliente: dato privado',
      historyMeta: {
        loaded: 20,
        truncated: false,
        newestAt: '2026-08-05T12:00:00.000Z',
      },
      dependencies: {
        getApiKey: () => 'test-key',
        resolveModel: () => 'memory-model',
        generateJson,
      },
    })).resolves.toEqual(priorMemory);

    const warnings = warn.mock.calls.map(([value]) => String(value));
    expect(warnings.some((value) => {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parsed.scope === 'inbox-ai-memory' &&
        parsed.event === 'gemini-refresh-failed';
    })).toBe(true);
    expect(warnings.join(' ')).not.toContain(priorMemory.stableKey);
    expect(warnings.join(' ')).not.toContain('dato privado');
    expect(supabase.upserts).toHaveLength(0);
    warn.mockRestore();
  });

  it('fails open and warns when the new-message count fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const supabase = createMemorySupabaseDouble({
      memory: priorMemoryRow,
      countError: new Error('count unavailable'),
    });
    const generateJson = vi.fn();

    await expect(loadOrRefreshInboxAiMemory({
      supabase: supabase.client,
      stableKey: priorMemory.stableKey,
      transcript: 'Cliente: dato privado',
      historyMeta: { loaded: 20, truncated: true },
      dependencies: {
        getApiKey: () => 'test-key',
        resolveModel: () => 'memory-model',
        generateJson,
      },
    })).resolves.toEqual(priorMemory);

    expect(generateJson).not.toHaveBeenCalled();
    expect(warn.mock.calls.some(([value]) => {
      const parsed = JSON.parse(String(value)) as Record<string, unknown>;
      return parsed.scope === 'inbox-ai-memory' &&
        parsed.event === 'message-count-failed';
    })).toBe(true);
    warn.mockRestore();
  });

  it('normalizes and upserts refreshed memory with marker, total count and model', async () => {
    const supabase = createMemorySupabaseDouble({
      memory: priorMemoryRow,
      totalVisible: 44,
      newVisible: 20,
    });
    const generateJson = vi.fn().mockResolvedValue({
      summary: '  Resumen nuevo  ',
      preferences: ['Tarde', 'Tarde', 5],
      objections: [' Precio '],
      agreements: ['Confirmar lunes'],
    });

    const result = await loadOrRefreshInboxAiMemory({
      supabase: supabase.client,
      stableKey: priorMemory.stableKey,
      transcript: 'Cliente: Prefiero la tarde',
      historyMeta: {
        loaded: 20,
        truncated: false,
        newestAt: '2026-08-05T12:00:00.000Z',
      },
      dependencies: {
        getApiKey: () => 'test-key',
        resolveModel: () => 'memory-model',
        generateJson,
        now: () => '2026-08-05T12:01:00.000Z',
      },
    });

    expect(result).toEqual({
      stableKey: priorMemory.stableKey,
      summary: 'Resumen nuevo',
      preferences: ['Tarde'],
      objections: ['Precio'],
      agreements: ['Confirmar lunes'],
      lastSummarizedMessageAt: '2026-08-05T12:00:00.000Z',
      messageCount: 44,
      model: 'memory-model',
      updatedAt: '2026-08-05T12:01:00.000Z',
    });
    expect(supabase.upserts).toEqual([{
      stable_key: priorMemory.stableKey,
      summary: 'Resumen nuevo',
      preferences: ['Tarde'],
      objections: ['Precio'],
      agreements: ['Confirmar lunes'],
      last_summarized_message_at: '2026-08-05T12:00:00.000Z',
      message_count: 44,
      model: 'memory-model',
      updated_at: '2026-08-05T12:01:00.000Z',
    }]);
    expect(supabase.calls).toContainEqual({
      table: 'whatsapp_conversation_ai_memory',
      method: 'upsert',
      args: [
        expect.any(Object),
        { onConflict: 'stable_key' },
      ],
    });
    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(generateJson).toHaveBeenCalledWith(expect.objectContaining({
      model: 'memory-model',
      logScope: 'inbox-ai-memory',
      logResponsePreview: false,
      responseJsonSchema: expect.objectContaining({
        type: 'object',
        required: ['summary', 'preferences', 'objections', 'agreements'],
        additionalProperties: false,
      }),
    }));
  });

  it('fails open and warns when the refreshed memory upsert fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const supabase = createMemorySupabaseDouble({
      memory: priorMemoryRow,
      totalVisible: 40,
      newVisible: 20,
      upsertError: new Error('upsert unavailable'),
    });
    const generateJson = vi.fn().mockResolvedValue({
      summary: 'Nuevo resumen',
      preferences: [],
      objections: [],
      agreements: [],
    });

    await expect(loadOrRefreshInboxAiMemory({
      supabase: supabase.client,
      stableKey: priorMemory.stableKey,
      transcript: 'Cliente: dato privado',
      historyMeta: {
        loaded: 20,
        truncated: false,
        newestAt: '2026-08-05T12:00:00.000Z',
      },
      dependencies: {
        getApiKey: () => 'test-key',
        resolveModel: () => 'memory-model',
        generateJson,
      },
    })).resolves.toEqual(priorMemory);

    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(supabase.upserts).toHaveLength(1);
    expect(warn.mock.calls.some(([value]) => {
      const parsed = JSON.parse(String(value)) as Record<string, unknown>;
      return parsed.scope === 'inbox-ai-memory' &&
        parsed.event === 'memory-upsert-failed';
    })).toBe(true);
    warn.mockRestore();
  });

  it('returns null when the initial read fails and no memory is available', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const supabase = createMemorySupabaseDouble({
      readError: new Error('database unavailable'),
    });

    await expect(loadOrRefreshInboxAiMemory({
      supabase: supabase.client,
      stableKey: priorMemory.stableKey,
      transcript: 'Cliente: Hola',
      historyMeta: { loaded: 1, truncated: false },
    })).resolves.toBeNull();

    expect(warn.mock.calls.some(([value]) => {
      const parsed = JSON.parse(String(value)) as Record<string, unknown>;
      return parsed.scope === 'inbox-ai-memory' &&
        parsed.event === 'memory-read-failed';
    })).toBe(true);
    warn.mockRestore();
  });
});
