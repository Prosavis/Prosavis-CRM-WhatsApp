import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import { getGeminiApiKey } from '../_shared/geminiClient.ts';
import { createInboxSuggestion } from '../_shared/inboxAiSuggestPipeline.ts';
import {
  resolveSuggestPipeline,
  suggestionStreamingEnabled,
} from '../_shared/inboxAiSuggestConfig.ts';
import { createStageTimer } from '../_shared/suggestTiming.ts';

const MAX_EXTRA_CONTEXT_CHARS = 2000;

function normalizeExtraContext(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  return text.length <= MAX_EXTRA_CONTEXT_CHARS ? text : `${text.slice(0, MAX_EXTRA_CONTEXT_CHARS)}…`;
}

function streamResponse(work: (send: (event: string, data: unknown) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        await work(send);
      } catch (error) {
        send('error', { error: formatError(error) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const stageTimer = createStageTimer();

  try {
    const { supabase, user } = await stageTimer.measure('auth', () => requireCrmAdmin(req));
    const body = await req.json().catch(() => ({}));
    const stableKey = String(body.stableKey ?? '').trim();
    const forceGenerate = body.forceGenerate === true;
    const includeVoiceTranscriptions = body.includeVoiceTranscriptions === true;
    const includeCachedImageAnalysis = body.includeImageAnalysis === true
      || body.includeCachedImageAnalysis === true;
    const extraContext = normalizeExtraContext(body.extraContext);
    const wantsStream = body.stream === true
      && suggestionStreamingEnabled()
      && resolveSuggestPipeline() === 'single';

    if (!stableKey) return jsonResponse({ error: 'Se requiere stableKey.' }, 400);

    const apiKey = getGeminiApiKey();
    if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY no configurada.' }, 412);

    const request = {
      supabase,
      apiKey,
      stableKey,
      forceGenerate,
      includeVoiceTranscriptions,
      includeCachedImageAnalysis,
      extraContext,
      createdBy: user?.id ?? null,
      stageTimer,
    };

    if (wantsStream) {
      return streamResponse(async (send) => {
        try {
          const response = await createInboxSuggestion({
            ...request,
            onSuggestionText: (text) => send('delta', { text }),
          });
          const payload = await response.json();
          send('done', payload);
        } finally {
          stageTimer.log('suggest-timing');
        }
      });
    }

    const response = await createInboxSuggestion(request);
    stageTimer.log('suggest-timing');
    return response;
  } catch (error) {
    stageTimer.log('suggest-timing');
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
