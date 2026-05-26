export const DEFAULT_REPLY_MODEL = 'gemini-2.5-flash';
export const GEMINI_TIMEOUT_MS = 75000;

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

export async function geminiGenerateText(params: {  apiKey: string;
  model?: string;
  systemInstruction?: string;
  userText: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string> {
  const model = params.model ?? DEFAULT_REPLY_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${params.apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    body: JSON.stringify({
      ...(params.systemInstruction
        ? { systemInstruction: { parts: [{ text: params.systemInstruction }] } }
        : {}),
      contents: [{ role: 'user', parts: [{ text: params.userText }] }],
      generationConfig: {
        temperature: params.temperature ?? 0.4,
        maxOutputTokens: params.maxOutputTokens ?? 2048,
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (data as { error?: { message?: string } })?.error?.message ||
      `Gemini respondió ${response.status}`;
    throw new Error(message);
  }

  const parts = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    ?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((part) => part.text ?? '').join('').trim();
  if (!text) throw new Error('Gemini no devolvió texto');
  return text;
}

export async function geminiGenerateJson<T>(params: {
  apiKey: string;
  model?: string;
  prompt: string;
}): Promise<T> {
  const raw = await geminiGenerateText({
    apiKey: params.apiKey,
    model: params.model,
    userText: params.prompt,
    temperature: 0,
  });
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Gemini no devolvió JSON válido');
  return JSON.parse(jsonMatch[0]) as T;
}
