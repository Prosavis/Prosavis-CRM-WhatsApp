import { normalizeBookingContext } from './bookingContext.ts';
import { jsonResponse } from './cors.ts';
import {
  geminiGenerateJsonWithMeta,
  geminiStreamGenerateContent,
  resolveBookingModel,
  resolveGeminiModel,
  resolveGeminiThinkingLevel,
  DEFAULT_GEMINI_MODEL,
  type GeminiJsonResult,
} from './geminiClient.ts';
import {
  appendRealAvailabilityContext,
  loadPrefetchedAvailability,
  loadRealAvailabilityDetailed,
  overwriteBookingAvailability,
  pickPrefetchedAvailability,
  type AvailabilityLoadResult,
} from './availability.ts';
import {
  INBOX_AI_SYSTEM_INSTRUCTION,
  buildInboxAiContext,
  groundBookingClientInfo,
  groundBookingPayment,
  type InboxAiContext,
} from './inboxAiContext.ts';
import {
  INBOX_AI_COMBINED_JSON_SCHEMA,
  normalizeInboxAiSuggestionOutput,
} from './inboxAiActions.ts';
import { resolveBookingPricingCheckout } from './pricingCatalog.ts';
import {
  createGeneratedInboxAiSuggestionResponse,
  createLastOutboundInboxAiSuggestionResponse,
} from './inboxAiSuggestionResponse.ts';
import {
  buildSuggestionLogContextMeta,
  insertWhatsAppAiSuggestionLog,
} from './inboxAiSuggestionLog.ts';
import { rewriteSuggestionGreetingName } from './inboxAiNameGrounding.ts';
import { appendAuthoritativePaymentLink } from './inboxAiSuggestionText.ts';
import { extractPartialJsonString } from './inboxAiStream.ts';
import {
  SUGGEST_HISTORY_TURN_LIMIT,
  SUGGEST_PREFETCH_DURATIONS,
  SUGGEST_TRANSCRIPT_CHAR_BUDGET,
  resolveSuggestPipeline,
  suggestionPrefetchEnabled,
  type SuggestPipeline,
} from './inboxAiSuggestConfig.ts';
import { readSuggestionPrefetch, latestVisibleMessageAnchor } from './suggestionPrefetch.ts';
import type { StageTimer } from './suggestTiming.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const BOOKING_PROMPT =
  'Analiza esta conversación de WhatsApp de Prosavis (limpieza en Colombia) y responde SOLO JSON con ' +
  'stage, collectedData {date,time,duration,address,addressSource}, missingData[], availableSlots[], ' +
  'paymentStatus, paymentAmount, wantsKit, clientInfo {name,phone,email,address,city,isReturningClient,userId}. ' +
  'Devuelve duration en minutos usando solo una duración oficial del catálogo y wantsKit como booleano. ' +
  'No inventes availableSlots: déjalo vacío salvo que el contexto incluya disponibilidad confirmada. ' +
  'No devuelvas precios ni links de pago; esos valores se resuelven en código. ' +
  'Usa el perfil CRM y citas como fuente de verdad cuando existan; no inventes citas. ' +
  'SEGURIDAD: si el cliente dice que a la hora H se va / no habrá nadie, pon collectedData.time una hora ANTES ' +
  '(p. ej. se van a las 08:00 → time "07:00"), nunca H exacta cuando la casa quedaría sola.';

export interface CreateInboxSuggestionParams {
  supabase: SupabaseClient;
  apiKey: string;
  stableKey: string;
  forceGenerate: boolean;
  includeVoiceTranscriptions: boolean;
  includeCachedImageAnalysis: boolean;
  extraContext: string;
  createdBy: string | null;
  stageTimer: StageTimer;
  allowPrefetchHit?: boolean;
  onSuggestionText?: (text: string) => void;
}

function parseModelJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini no devolvió JSON válido');
    return JSON.parse(match[0]) as unknown;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function usageFields(meta: GeminiJsonResult<unknown> | GeminiJsonResult<string>) {
  return {
    model: meta.model,
    thinkingLevel: meta.thinkingLevel ?? null,
    elapsedMs: meta.elapsedMs,
    ...meta.usage,
  };
}

async function resolveAvailability(params: {
  duration: unknown;
  prefetched: Map<number, AvailabilityLoadResult>;
  availabilityStarted: number;
  stageTimer: StageTimer;
}): Promise<string[]> {
  const picked = pickPrefetchedAvailability(params.prefetched, params.duration);
  const resolved = picked ?? await loadRealAvailabilityDetailed(params.duration);
  params.stageTimer.record('availability', Date.now() - params.availabilityStarted, {
    outcome: resolved.outcome,
    prefetched: picked != null,
  });
  return resolved.slots;
}

async function loadPrepared(params: CreateInboxSuggestionParams, pipeline: SuggestPipeline) {
  const fast = pipeline === 'single';
  const availabilityStarted = Date.now();
  const availabilityPromise = loadPrefetchedAvailability([...SUGGEST_PREFETCH_DURATIONS]);
  const ctx = await buildInboxAiContext(params.supabase, params.stableKey, {
    includeVoiceTranscriptions: params.includeVoiceTranscriptions,
    includeImageAnalysis: false,
    includeCachedImageAnalysis: params.includeCachedImageAnalysis,
    includeProviderNames: false,
    memoryRefresh: 'background',
    promptLayout: fast ? 'compact' : 'legacy',
    historyLimit: fast ? SUGGEST_HISTORY_TURN_LIMIT : undefined,
    transcriptCharBudget: fast ? SUGGEST_TRANSCRIPT_CHAR_BUDGET : undefined,
    stageTimer: params.stageTimer,
  });
  return { ctx, availabilityPromise, availabilityStarted };
}

function responseFields(ctx: InboxAiContext) {
  return {
    historyMeta: ctx.historyMeta,
    conversationTags: ctx.conversationTags,
    sessionWindow: ctx.sessionWindow,
    propertySummary: ctx.propertySummary,
    appointments: ctx.appointments,
    appointmentsLoadFailed: ctx.appointmentsLoadFailed,
  };
}

export async function createInboxSuggestion(
  params: CreateInboxSuggestionParams,
): Promise<Response> {
  const pipeline = resolveSuggestPipeline();
  if (params.allowPrefetchHit !== false && suggestionPrefetchEnabled() && !params.forceGenerate) {
    const anchor = await latestVisibleMessageAnchor(params.supabase, params.stableKey);
    const cached = anchor
      ? await readSuggestionPrefetch(params.supabase, params.stableKey, anchor.id)
      : null;
    if (cached) {
      params.stageTimer.record('prefetch', 0, { hit: true });
      return jsonResponse(cached);
    }
  }

  const prepared = await loadPrepared(params, pipeline);
  const { ctx } = prepared;
  console.log(JSON.stringify({
    scope: 'suggest-whatsapp-agent-reply',
    event: 'context-built',
    pipeline,
    historyMeta: ctx.historyMeta,
    conversationTagCount: ctx.conversationTags.length,
    hasDirectory: Boolean(ctx.directory),
    appointmentCount: ctx.appointmentCount,
    listedAppointments: ctx.appointments.length,
    propertyPattern: ctx.propertySummary.pattern,
    uniqueProperties: ctx.propertySummary.uniquePropertyCount,
  }));

  if (ctx.lastTurnRole === 'bot' && !params.forceGenerate) {
    return createLastOutboundInboxAiSuggestionResponse({
      historyMeta: ctx.historyMeta,
      conversationTags: ctx.conversationTags,
      sessionWindow: ctx.sessionWindow,
      propertySummary: ctx.propertySummary,
      appointments: ctx.appointments,
      appointmentsLoadFailed: ctx.appointmentsLoadFailed,
    });
  }

  if (pipeline === 'single') {
    return completeSingleCall(params, prepared);
  }
  return completeLegacyCall(params, prepared);
}

async function completeLegacyCall(
  params: CreateInboxSuggestionParams,
  prepared: Awaited<ReturnType<typeof loadPrepared>>,
): Promise<Response> {
  const { ctx } = prepared;
  const bookingStarted = Date.now();
  let bookingMeta: GeminiJsonResult<Record<string, unknown>> | null = null;
  try {
    bookingMeta = await geminiGenerateJsonWithMeta<Record<string, unknown>>({
      apiKey: params.apiKey,
      model: resolveBookingModel(),
      thinkingLevel: resolveGeminiThinkingLevel('GEMINI_THINKING_BOOKING', 'low'),
      prompt: `${BOOKING_PROMPT} Teléfono cliente: ${ctx.phone}\n\n${ctx.formattedBlock}`,
      logScope: 'suggest-booking',
    });
  } catch {
    bookingMeta = null;
  }
  params.stageTimer.record(
    'gemini_booking',
    bookingMeta?.elapsedMs ?? Date.now() - bookingStarted,
    bookingMeta ? usageFields(bookingMeta) : { failed: true },
  );

  const groundedPaymentContext = groundBookingPayment(bookingMeta?.data ?? {}, ctx);
  const priced = resolveBookingPricingCheckout(groundedPaymentContext, ctx.phone);
  const groundedBookingContext = groundBookingClientInfo(priced.bookingContext, ctx);
  const prefetched = await prepared.availabilityPromise;
  const slots = await resolveAvailability({
    duration: groundedBookingContext.collectedData.duration,
    prefetched,
    availabilityStarted: prepared.availabilityStarted,
    stageTimer: params.stageTimer,
  });
  const bookingContext = overwriteBookingAvailability(groundedBookingContext, slots);
  const groundedContext = appendRealAvailabilityContext(ctx.formattedBlock, slots);
  const anchor = await latestVisibleMessageAnchor(params.supabase, params.stableKey);
  const extras: Record<string, unknown> = {
    pipeline: 'legacy',
    anchorNewestAt: ctx.historyMeta.newestAt,
    anchorMessageAt: anchor?.createdAt ?? null,
    anchorMessageId: anchor?.id ?? null,
    geminiBooking: bookingMeta ? usageFields(bookingMeta) : null,
    bookingReuse: {
      ...responseFields(ctx),
      bookingContext,
      ...(priced.wompiCheckoutUrl ? { wompiCheckoutUrl: priced.wompiCheckoutUrl } : {}),
      ...(priced.wompiPaymentReference ? { wompiPaymentReference: priced.wompiPaymentReference } : {}),
      ...(priced.wompiAmountCOP ? { wompiAmountCOP: priced.wompiAmountCOP } : {}),
    },
  };

  return createGeneratedInboxAiSuggestionResponse({
    apiKey: params.apiKey,
    systemInstruction: INBOX_AI_SYSTEM_INSTRUCTION,
    contextPrompt:
      `${params.extraContext ? `Contexto extra del agente:\n${params.extraContext}\n\n` : ''}` +
      `${groundedContext}\n\n` +
      `Contexto booking (inferido + CRM):\n${JSON.stringify(bookingContext)}` +
      (priced.wompiCheckoutUrl ? `\nLink Wompi: ${priced.wompiCheckoutUrl}` : ''),
    grounding: {
      bookingContext,
      appointments: ctx.appointments,
      wompiCheckoutUrl: priced.wompiCheckoutUrl,
      wompiPaymentReference: priced.wompiPaymentReference,
      wompiAmountCOP: priced.wompiAmountCOP,
    },
    responseContext: responseFields(ctx),
    greetingFirstName: ctx.greetingFirstName,
    suggestionLog: {
      supabase: params.supabase,
      stableKey: params.stableKey,
      createdBy: params.createdBy,
      extras,
    },
    stageTimer: params.stageTimer,
    onModel: (meta) => {
      params.stageTimer.record('gemini_suggestion', meta.elapsedMs, usageFields(meta));
      extras.timing = params.stageTimer.snapshot();
    },
  });
}

async function completeSingleCall(
  params: CreateInboxSuggestionParams,
  prepared: Awaited<ReturnType<typeof loadPrepared>>,
): Promise<Response> {
  const { ctx } = prepared;
  const model = resolveGeminiModel('GEMINI_MODEL_JSON', DEFAULT_GEMINI_MODEL);
  const thinkingLevel = resolveGeminiThinkingLevel('GEMINI_THINKING_SUGGEST', 'low');
  const prompt =
    `${params.extraContext ? `Instrucción del agente:\n${params.extraContext}\n\n` : ''}` +
    `${ctx.formattedBlock}\n\n` +
    `${BOOKING_PROMPT}\n` +
    'En el mismo JSON devuelve booking, suggestion y proposedActions. ' +
    'suggestion es el borrador de WhatsApp. No incluyas precios ni links; el código los agrega. ' +
    `Teléfono cliente: ${ctx.phone}`;
  const systemInstruction = INBOX_AI_SYSTEM_INSTRUCTION;

  let meta: GeminiJsonResult<unknown>;
  if (params.onSuggestionText) {
    const streamed = await geminiStreamGenerateContent({
      apiKey: params.apiKey,
      model,
      thinkingLevel,
      systemInstruction,
      prompt,
      responseJsonSchema: INBOX_AI_COMBINED_JSON_SCHEMA,
      logScope: 'suggest-whatsapp-agent-reply',
      onText: (accumulated) => {
        const partial = extractPartialJsonString(accumulated, 'suggestion');
        if (partial != null) params.onSuggestionText?.(partial);
      },
    });
    meta = {
      ...streamed,
      data: parseModelJson(streamed.data),
    };
  } else {
    meta = await geminiGenerateJsonWithMeta<unknown>({
      apiKey: params.apiKey,
      model,
      thinkingLevel,
      systemInstruction,
      prompt,
      responseJsonSchema: INBOX_AI_COMBINED_JSON_SCHEMA,
      logScope: 'suggest-whatsapp-agent-reply',
    });
  }
  params.stageTimer.record('gemini_booking', 0, { fused: true });
  params.stageTimer.record('gemini_suggestion', meta.elapsedMs, usageFields(meta));

  const raw = isRecord(meta.data) ? meta.data : {};
  const normalizedBooking = normalizeBookingContext(raw.booking, ctx.phone);
  const groundedPaymentContext = groundBookingPayment(normalizedBooking, ctx);
  const priced = resolveBookingPricingCheckout(groundedPaymentContext, ctx.phone);
  const groundedBookingContext = groundBookingClientInfo(priced.bookingContext, ctx);
  const prefetched = await prepared.availabilityPromise;
  const slots = await resolveAvailability({
    duration: groundedBookingContext.collectedData.duration,
    prefetched,
    availabilityStarted: prepared.availabilityStarted,
    stageTimer: params.stageTimer,
  });
  const bookingContext = overwriteBookingAvailability(groundedBookingContext, slots);
  const suggestionOutput = normalizeInboxAiSuggestionOutput({
    suggestion: raw.suggestion,
    proposedActions: raw.proposedActions,
  }, {
    bookingContext,
    appointments: ctx.appointments,
    wompiCheckoutUrl: priced.wompiCheckoutUrl,
    wompiPaymentReference: priced.wompiPaymentReference,
    wompiAmountCOP: priced.wompiAmountCOP,
  });
  suggestionOutput.suggestion = appendAuthoritativePaymentLink(
    rewriteSuggestionGreetingName(suggestionOutput.suggestion, ctx.greetingFirstName),
    priced.wompiCheckoutUrl,
  );

  const anchor = await latestVisibleMessageAnchor(params.supabase, params.stableKey);
  const extras: Record<string, unknown> = {
    pipeline: 'single',
    anchorNewestAt: ctx.historyMeta.newestAt,
    anchorMessageAt: anchor?.createdAt ?? null,
    anchorMessageId: anchor?.id ?? null,
    geminiSuggestion: usageFields(meta),
    timing: params.stageTimer.snapshot(),
    bookingReuse: {
      ...responseFields(ctx),
      bookingContext,
      ...(priced.wompiCheckoutUrl ? { wompiCheckoutUrl: priced.wompiCheckoutUrl } : {}),
      ...(priced.wompiPaymentReference ? { wompiPaymentReference: priced.wompiPaymentReference } : {}),
      ...(priced.wompiAmountCOP ? { wompiAmountCOP: priced.wompiAmountCOP } : {}),
    },
  };

  let suggestionLogId: string | null = null;
  if (suggestionOutput.suggestion) {
    const contextMeta = buildSuggestionLogContextMeta({
      historyMeta: ctx.historyMeta,
      conversationTags: ctx.conversationTags,
      propertySummary: ctx.propertySummary,
      sessionWindow: ctx.sessionWindow,
      proposedActionTypes: suggestionOutput.proposedActions.map((action) => action.type),
      extras,
    });
    suggestionLogId = await params.stageTimer.measure('log_insert', () => insertWhatsAppAiSuggestionLog(
      params.supabase,
      {
        stableKey: params.stableKey,
        suggestion: suggestionOutput.suggestion,
        model: meta.model,
        contextMeta,
        createdBy: params.createdBy,
      },
    ));
  } else {
    params.stageTimer.record('log_insert', 0, { skipped: true });
  }

  return jsonResponse({
    suggestion: suggestionOutput.suggestion,
    proposedActions: suggestionOutput.proposedActions,
    lastMessageIsOutbound: false,
    bookingContext,
    suggestionLogId,
    ...responseFields(ctx),
    ...(priced.wompiCheckoutUrl ? { wompiCheckoutUrl: priced.wompiCheckoutUrl } : {}),
    ...(priced.wompiPaymentReference ? { wompiPaymentReference: priced.wompiPaymentReference } : {}),
    ...(priced.wompiAmountCOP ? { wompiAmountCOP: priced.wompiAmountCOP } : {}),
  });
}
