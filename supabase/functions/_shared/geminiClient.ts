/**
 * Cliente compartido para Google Gemini API.
 * Único proveedor de IA para el CRM WhatsApp.
 * Usa gemini-3.5-flash como modelo por defecto (GA, estable desde mayo 2026).
 *
 * Documentación:
 *   https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash
 *   https://ai.google.dev/gemini-api/docs/structured-output
 */

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
export const GEMINI_TIMEOUT_MS = 75000;
export const MAX_INLINE_AUDIO_BYTES = 180 * 1024; // 180 KB — inline; mayor usa asset

/** Lee la API Key de Gemini desde variables de entorno. */
export function getGeminiApiKey(): string | null {
  return Deno.env.get('GEMINI_API_KEY')?.trim() || null;
}

/** Resuelve el modelo desde env o usa el default. */
export function resolveGeminiModel(envKey: string, fallback: string): string {
  return Deno.env.get(envKey)?.trim() || fallback;
}

/**
 * Modelo para análisis masivo del directorio.
 * Pro consume tokens de razonamiento interno y trunca JSON largo → forzamos Flash
 * aunque GEMINI_MODEL_DIRECTORY_ANALYSIS apunte a pro.
 */
export function resolveDirectoryAnalysisModel(): {
  model: string;
  configured: string | null;
  overridden: boolean;
} {
  const configured = Deno.env.get('GEMINI_MODEL_DIRECTORY_ANALYSIS')?.trim() || null;
  const isPro = configured != null && /\bpro\b/i.test(configured);
  if (!configured || isPro) {
    return {
      model: DEFAULT_GEMINI_MODEL,
      configured,
      overridden: configured != null && configured !== DEFAULT_GEMINI_MODEL,
    };
  }
  return { model: configured, configured, overridden: false };
}

/** Logs estructurados visibles en Supabase → Edge Functions → Logs. */
export function geminiLog(
  scope: string,
  event: string,
  data?: Record<string, unknown>,
): void {
  console.log(JSON.stringify({ scope, event, ts: new Date().toISOString(), ...data }));
}

// ─── Tipos internos para la API de Gemini ────────────────────────────────

interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiContent {
  role?: string;
  parts: GeminiPart[];
}

interface GeminiGenerateContentRequest {
  contents: GeminiContent[];
  systemInstruction?: GeminiContent;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
    stopSequences?: string[];
    responseMimeType?: string;
    responseSchema?: Record<string, unknown>;
  };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
    finishReason?: string;
  }>;
  promptFeedback?: Record<string, unknown>;
}

// ─── Cliente HTTP ─────────────────────────────────────────────────────────

async function geminiRequest(params: {
  apiKey: string;
  model: string;
  contents: GeminiContent[];
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: Record<string, unknown>;
}): Promise<GeminiGenerateContentResponse> {
  const url = `${GEMINI_BASE_URL}/models/${params.model}:generateContent`;

  const body: GeminiGenerateContentRequest = {
    contents: params.contents,
    generationConfig: {
      temperature: params.temperature ?? 0.4,
      maxOutputTokens: params.maxOutputTokens ?? 2048,
    },
  };

  if (params.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: params.systemInstruction }],
    };
  }

  if (params.responseMimeType) {
    body.generationConfig!.responseMimeType = params.responseMimeType;
  }

  if (params.responseSchema) {
    body.generationConfig!.responseSchema = params.responseSchema;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': params.apiKey,
    },
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    let message = `Gemini API respondió ${response.status}`;
    if (errorBody) {
      try {
        const parsed = JSON.parse(errorBody);
        message = parsed.error?.message ?? message;
      } catch {
        message = `${message}: ${errorBody.slice(0, 200)}`;
      }
    }
    throw new Error(message);
  }

  const data = await response.json() as GeminiGenerateContentResponse;
  return data;
}

function extractTextFromResponse(data: GeminiGenerateContentResponse): string {
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error('Gemini no devolvió candidatos');

  const parts = candidate.content?.parts;
  if (!parts?.length) {
    const reason = candidate.finishReason;
    if (reason === 'MAX_TOKENS') {
      throw new GeminiMaxTokensError(`Gemini no devolvió contenido (finishReason: ${reason})`);
    }
    if (reason && reason !== 'STOP') {
      throw new Error(`Gemini no devolvió contenido (finishReason: ${reason})`);
    }
    throw new Error('Gemini no devolvió contenido');
  }

  const text = parts.map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error('Gemini devolvió contenido vacío');

  return text;
}

/** Quita fences de markdown (```json ... ```) que algunos modelos añaden. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

// ─── Funciones públicas ───────────────────────────────────────────────────

/**
 * Genera texto usando Gemini.
 * Acepta systemInstruction opcional, temperature y maxOutputTokens.
 */
export async function geminiGenerateText(params: {
  apiKey: string;
  model?: string;
  systemInstruction?: string;
  userText: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const model = params.model ??
    resolveGeminiModel('GEMINI_MODEL_REPLY', DEFAULT_GEMINI_MODEL);

  const contents: GeminiContent[] = [
    { role: 'user', parts: [{ text: params.userText }] },
  ];

  const data = await geminiRequest({
    apiKey: params.apiKey,
    model,
    contents,
    systemInstruction: params.systemInstruction,
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
  });

  return extractTextFromResponse(data);
}

/** Error tipado cuando Gemini trunca la salida por límite de tokens. */
export class GeminiMaxTokensError extends Error {
  readonly finishReason = 'MAX_TOKENS';

  constructor(message: string) {
    super(message);
    this.name = 'GeminiMaxTokensError';
  }
}

export function isGeminiMaxTokensError(error: unknown): boolean {
  if (error instanceof GeminiMaxTokensError) return true;
  const msg = String((error as Error)?.message ?? error);
  return msg.includes('MAX_TOKENS');
}

export interface GeminiJsonResult<T> {
  data: T;
  finishReason?: string;
}

/**
 * Genera JSON estructurado usando Gemini.
 * Usa response_mime_type: "application/json" para forzar salida JSON válida.
 */
export async function geminiGenerateJson<T>(params: {
  apiKey: string;
  model?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseSchema?: Record<string, unknown>;
}): Promise<T> {
  const result = await geminiGenerateJsonWithMeta<T>(params);
  return result.data;
}

/** Igual que geminiGenerateJson pero expone finishReason para depuración/retry. */
export async function geminiGenerateJsonWithMeta<T>(params: {
  apiKey: string;
  model?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseSchema?: Record<string, unknown>;
  logScope?: string;
}): Promise<GeminiJsonResult<T>> {
  const model = params.model ??
    resolveGeminiModel('GEMINI_MODEL_JSON', DEFAULT_GEMINI_MODEL);
  const scope = params.logScope ?? 'gemini-json';
  const promptChars = params.prompt.length;

  geminiLog(scope, 'request', {
    model,
    promptChars,
    maxOutputTokens: params.maxOutputTokens ?? 8192,
    hasSchema: !!params.responseSchema,
  });

  const started = Date.now();
  const data = await geminiRequest({
    apiKey: params.apiKey,
    model,
    contents: [{ role: 'user', parts: [{ text: params.prompt }] }],
    temperature: params.temperature ?? 0,
    maxOutputTokens: params.maxOutputTokens ?? 8192,
    responseMimeType: 'application/json',
    responseSchema: params.responseSchema,
  });

  const finishReason = data.candidates?.[0]?.finishReason;
  const elapsedMs = Date.now() - started;

  let raw: string;
  try {
    raw = stripCodeFences(extractTextFromResponse(data));
  } catch (e) {
    geminiLog(scope, 'extract_failed', {
      model,
      finishReason,
      elapsedMs,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }

  try {
    const parsed = JSON.parse(raw) as T;
    geminiLog(scope, 'success', {
      model,
      finishReason,
      elapsedMs,
      responseChars: raw.length,
    });
    return { data: parsed, finishReason };
  } catch {
    const jsonMatch = raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as T;
        geminiLog(scope, 'success_salvaged', {
          model,
          finishReason,
          elapsedMs,
          responseChars: raw.length,
        });
        return { data: parsed, finishReason };
      } catch {
        // cae al throw de abajo
      }
    }
    const truncated = finishReason === 'MAX_TOKENS'
      ? ' (respuesta truncada por MAX_TOKENS; reduce el lote o sube maxOutputTokens)'
      : finishReason && finishReason !== 'STOP'
        ? ` (finishReason: ${finishReason})`
        : '';
    const message = `Gemini no devolvió JSON válido${truncated}: ${raw.slice(0, 200)}`;
    geminiLog(scope, 'parse_failed', {
      model,
      finishReason,
      elapsedMs,
      responseChars: raw.length,
      preview: raw.slice(0, 120),
    });
    if (finishReason === 'MAX_TOKENS') {
      throw new GeminiMaxTokensError(message);
    }
    throw new Error(message);
  }
}

/**
 * Codifica binarios grandes sin desbordar la pila (evita spread sobre Uint8Array).
 */
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/** Normaliza MIME type de audio para Gemini. */
function audioMimeType(mimeType: string): string {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  if (base === 'audio/x-wav' || base === 'audio/wav') return 'audio/wav';
  if (base === 'audio/mp3' || base === 'audio/mpeg') return 'audio/mpeg';
  if (base === 'audio/mp4') return 'audio/mp4';
  if (base === 'audio/aac') return 'audio/aac';
  // ogg/opus es el formato común de WhatsApp
  return 'audio/ogg';
}

/**
 * Transcribe audio usando Gemini (multimodal).
 * Descarga el audio de WhatsApp y lo envía a Gemini como inline_data.
 * Gemini 3.5 Flash soporta entrada de audio nativa.
 */
export async function geminiTranscribeAudio(params: {
  apiKey: string;
  buffer: Uint8Array;
  mimeType: string;
  model?: string;
}): Promise<string> {
  const model = params.model ??
    resolveGeminiModel('GEMINI_MODEL_TRANSCRIBE', DEFAULT_GEMINI_MODEL);

  const mime = audioMimeType(params.mimeType);
  const audioB64 = bytesToBase64(params.buffer);

  const instruction =
    'Transcribe este audio de WhatsApp en español de Colombia. ' +
    'Devuelve solo el texto transcrito; si no se entiende, indica que no fue posible transcribir sin inventar.';

  const data = await geminiRequest({
    apiKey: params.apiKey,
    model,
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: mime, data: audioB64 } },
        { text: instruction },
      ],
    }],
    temperature: 0,
    maxOutputTokens: 2048,
  });

  return extractTextFromResponse(data);
}
