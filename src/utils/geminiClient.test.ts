import { afterEach, describe, expect, it, vi } from 'vitest';
import { geminiGenerateJson } from '../../supabase/functions/_shared/geminiClient';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('geminiGenerateJson HTTP transport', () => {
  it('sends strict JSON Schema through generationConfig.responseJsonSchema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ text: '{"summary":"ok"}' }],
        },
        finishReason: 'STOP',
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const strictSchema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string' },
      },
      required: ['summary'],
    };

    await geminiGenerateJson({
      apiKey: 'test-api-key',
      model: 'gemini-3.6-flash',
      prompt: 'Resume',
      responseJsonSchema: strictSchema,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      generationConfig: Record<string, unknown>;
    };
    expect(body.generationConfig.responseJsonSchema).toEqual(strictSchema);
    expect(body.generationConfig).not.toHaveProperty('responseSchema');
  });

  it('keeps legacy responseSchema callers on generationConfig.responseSchema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{
        content: {
          parts: [{ text: '{"value":"ok"}' }],
        },
        finishReason: 'STOP',
      }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const legacySchema = {
      type: 'object',
      properties: {
        value: { type: 'string' },
      },
    };

    await geminiGenerateJson({
      apiKey: 'test-api-key',
      model: 'gemini-3.6-flash',
      prompt: 'Legacy',
      responseSchema: legacySchema,
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      generationConfig: Record<string, unknown>;
    };
    expect(body.generationConfig.responseSchema).toEqual(legacySchema);
    expect(body.generationConfig).not.toHaveProperty('responseJsonSchema');
  });
});
