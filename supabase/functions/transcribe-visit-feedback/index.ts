import { requireAdmin } from "../_shared/adminAuth.ts";
import {
  geminiTranscribeAudio,
  getGeminiApiKey,
} from "../_shared/geminiClient.ts";
import {
  strictJsonResponse,
  strictPreflightResponse,
} from "../_shared/strictCors.ts";

const MAX_BODY_BYTES = 900_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return strictPreflightResponse(request);
  if (request.method !== "POST") {
    return strictJsonResponse(request, { error: "Método no permitido." }, 405);
  }

  try {
    await requireAdmin(request);
  } catch (error) {
    if (error instanceof Response) return error;
    return strictJsonResponse(request, { error: "Usuario no autenticado." }, 401);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return strictJsonResponse(request, { error: "Audio demasiado grande." }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!isRecord(parsed)) throw new Error("Body inválido.");
    body = parsed;
  } catch (error) {
    return strictJsonResponse(
      request,
      { error: error instanceof Error ? error.message : "Body inválido." },
      400,
    );
  }

  const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64.trim() : "";
  const mimeType = typeof body.mimeType === "string" && body.mimeType.trim()
    ? body.mimeType.trim()
    : "audio/webm";
  if (!audioBase64) {
    return strictJsonResponse(request, { error: "Falta el audio." }, 400);
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return strictJsonResponse(request, { error: "Gemini no está configurado." }, 500);
  }

  try {
    const buffer = decodeBase64(audioBase64);
    const result = await geminiTranscribeAudio({
      apiKey,
      buffer,
      mimeType,
      instruction:
        "Transcribe esta nota de voz de operación de campo en español de Colombia. " +
        "Devuelve solo el texto transcrito, sin comillas ni comentarios. " +
        "Si no se entiende, indica que no fue posible transcribir sin inventar.",
    });
    const text = result.text.trim();
    if (!text) {
      return strictJsonResponse(request, { error: "No se entendió el audio." }, 422);
    }
    return strictJsonResponse(request, { data: { text } });
  } catch (error) {
    return strictJsonResponse(
      request,
      {
        error: error instanceof Error
          ? error.message
          : "No fue posible transcribir el audio.",
      },
      500,
    );
  }
});
