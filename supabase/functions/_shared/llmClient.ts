export const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
export const NVCF_ASSETS_URL = 'https://api.nvcf.nvidia.com/v2/nvcf/assets';
export const LLM_TIMEOUT_MS = 75000;
export const NVCF_INLINE_AUDIO_MAX_BYTES = 180 * 1024;

/** mistral-nemotron estaba DEGRADED en integrate.api (mayo 2026). */
export const DEFAULT_REPLY_MODEL = 'meta/llama-4-maverick-17b-128e-instruct';
export const DEFAULT_JSON_MODEL = 'nvidia/nemotron-mini-4b-instruct';
export const DEFAULT_TEMPLATE_MODEL = DEFAULT_REPLY_MODEL;
export const DEFAULT_TRANSCRIBE_MODEL = 'google/gemma-3n-e4b-it';

export function getNvidiaApiKey(): string | null {
  return Deno.env.get('NVIDIA_API_KEY')?.trim() || null;
}

export function resolveNvidiaModel(envKey: string, fallback: string): string {
  return Deno.env.get(envKey)?.trim() || fallback;
}

/** Codifica binarios grandes sin desbordar la pila (evita spread sobre Uint8Array). */
export function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function audioDataUriType(mimeType: string): string {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  if (base === 'audio/opus') return 'audio/ogg';
  if (base === 'audio/x-wav') return 'audio/wav';
  return base || 'audio/ogg';
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
}

async function uploadNvcfAsset(params: {
  apiKey: string;
  buffer: Uint8Array;
  contentType: string;
}): Promise<string> {
  const createRes = await fetch(NVCF_ASSETS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contentType: params.contentType,
      description: 'prosavis-whatsapp-audio-stt',
    }),
  });
  const created = await createRes.json().catch(() => ({})) as {
    assetId?: string;
    uploadUrl?: string;
    message?: string;
  };
  if (!createRes.ok || !created.assetId || !created.uploadUrl) {
    throw new Error(created.message ?? `NVCF asset create falló (${createRes.status})`);
  }

  const uploadRes = await fetch(created.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': params.contentType },
    body: params.buffer,
  });
  if (!uploadRes.ok) {
    throw new Error(`NVCF asset upload falló (${uploadRes.status})`);
  }
  return created.assetId;
}

async function nvidiaChatCompletions(params: {
  apiKey: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  extraHeaders?: Record<string, string>;
}): Promise<string> {
  const url = `${Deno.env.get('NVIDIA_BASE_URL')?.trim() || NVIDIA_BASE_URL}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
      ...(params.extraHeaders ?? {}),
    },
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      temperature: params.temperature ?? 0.4,
      max_tokens: params.maxTokens ?? 2048,
    }),
  });

  const data = await response.json().catch(() => ({})) as ChatCompletionResponse;
  if (!response.ok) {
    const message = data.error?.message ?? `NVIDIA NIM respondió ${response.status}`;
    throw new Error(message);
  }

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('NVIDIA NIM no devolvió texto');
  return content;
}

export async function llmGenerateText(params: {
  apiKey: string;
  model?: string;
  systemInstruction?: string;
  userText: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const model = params.model ??
    resolveNvidiaModel('NVIDIA_MODEL_REPLY', DEFAULT_REPLY_MODEL);
  const messages: Array<{ role: string; content: string }> = [];
  if (params.systemInstruction) {
    messages.push({ role: 'system', content: params.systemInstruction });
  }
  messages.push({ role: 'user', content: params.userText });

  return nvidiaChatCompletions({
    apiKey: params.apiKey,
    model,
    messages,
    temperature: params.temperature,
    maxTokens: params.maxOutputTokens,
  });
}

export async function llmGenerateJson<T>(params: {
  apiKey: string;
  model?: string;
  prompt: string;
}): Promise<T> {
  const raw = await llmGenerateText({
    apiKey: params.apiKey,
    model: params.model ?? resolveNvidiaModel('NVIDIA_MODEL_JSON', DEFAULT_JSON_MODEL),
    userText: params.prompt,
    temperature: 0,
    maxOutputTokens: 2048,
  });
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('NVIDIA NIM no devolvió JSON válido');
  return JSON.parse(jsonMatch[0]) as T;
}

export async function llmTranscribeAudio(params: {
  apiKey: string;
  buffer: Uint8Array;
  mimeType: string;
  model?: string;
}): Promise<string> {
  const model = params.model ??
    resolveNvidiaModel('NVIDIA_MODEL_TRANSCRIBE', DEFAULT_TRANSCRIBE_MODEL);
  const dataType = audioDataUriType(params.mimeType);
  const instruction =
    'Transcribe este audio de WhatsApp en español de Colombia. ' +
    'Devuelve solo el texto transcrito; si no se entiende, indica que no fue posible transcribir sin inventar.';

  let userContent: string;
  let extraHeaders: Record<string, string> | undefined;

  if (params.buffer.byteLength <= NVCF_INLINE_AUDIO_MAX_BYTES) {
    const audioB64 = bytesToBase64(params.buffer);
    userContent =
      `${instruction} <audio src="data:${dataType};base64,${audioB64}" />`;
  } else {
    const assetId = await uploadNvcfAsset({
      apiKey: params.apiKey,
      buffer: params.buffer,
      contentType: params.mimeType.split(';')[0].trim() || 'audio/ogg',
    });
    userContent =
      `${instruction} <audio src="data:${dataType};asset_id,${assetId}" />`;
    extraHeaders = { 'NVCF-INPUT-ASSET-REFERENCES': assetId };
  }

  return nvidiaChatCompletions({
    apiKey: params.apiKey,
    model,
    messages: [{ role: 'user', content: userContent }],
    temperature: 0,
    maxTokens: 2048,
    extraHeaders,
  });
}
