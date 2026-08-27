// deno-lint-ignore-file no-explicit-any
import { getGeminiApiKey, geminiTranscribeAudio, resolveGeminiModel, DEFAULT_GEMINI_MODEL } from './geminiClient.ts';
import {
  isVoiceTranscriptionFeatureEnabled,
  MAX_STT_AUDIO_BYTES,
} from './inboxAiMediaLimits.ts';
import {
  downloadWhatsAppBucketBytes,
  downloadWhatsAppMediaFromMeta,
} from './whatsappMediaStorage.ts';

type SupabaseClient = any;

export type TranscribeInboundAudioResult =
  | { ok: true; cached: boolean; transcript: string }
  | { ok: false; error: string; status: number };

function readEnv(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  };
  return runtime.Deno?.env?.get?.(name);
}

export function isVoiceTranscriptionEnabled(): boolean {
  return isVoiceTranscriptionFeatureEnabled(
    readEnv('FEATURE_WHATSAPP_VOICE_TRANSCRIPTION_ENABLED'),
  );
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

async function withOneRetry<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch {
    return await work();
  }
}

async function loadInboundAudioBytes(
  supabase: SupabaseClient,
  row: {
    storage_path?: string | null;
    mime_type?: string | null;
    media_id?: string | null;
  },
): Promise<{ buffer: Uint8Array; mimeType: string }> {
  if (row.storage_path) {
    try {
      const buffer = await downloadWhatsAppBucketBytes(supabase, String(row.storage_path));
      return {
        buffer,
        mimeType: String(row.mime_type || 'audio/ogg'),
      };
    } catch (error) {
      console.warn('[transcribe-inbound-audio] Storage download failed; falling back to Meta', {
        error: formatUnknownError(error),
      });
    }
  }
  if (!row.media_id) {
    throw new Error('No hay bytes de audio (sin storage_path ni media_id).');
  }
  const media = await downloadWhatsAppMediaFromMeta(String(row.media_id));
  return { buffer: media.bytes, mimeType: media.mimeType };
}

export async function transcribeInboundAudioById(
  supabase: SupabaseClient,
  messageLogId: string,
  options?: { force?: boolean },
): Promise<TranscribeInboundAudioResult> {
  if (!isVoiceTranscriptionEnabled()) {
    return {
      ok: false,
      error: 'La transcripción de audios está desactivada temporalmente.',
      status: 412,
    };
  }

  const { data: row, error: readError } = await supabase
    .from('whatsapp_message_log')
    .select('*')
    .eq('id', messageLogId)
    .single();
  if (readError) {
    return { ok: false, error: formatUnknownError(readError), status: 500 };
  }

  if (row.direction !== 'inbound' || row.media_type !== 'audio' || !row.media_id) {
    return { ok: false, error: 'Solo se pueden transcribir audios inbound con mediaId.', status: 400 };
  }

  if (row.voice_transcription && !options?.force) {
    return { ok: true, cached: true, transcript: String(row.voice_transcription) };
  }

  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return { ok: false, error: 'GEMINI_API_KEY no configurada.', status: 412 };
  }

  try {
    const media = await loadInboundAudioBytes(supabase, row);
    if (!media.mimeType.startsWith('audio/')) {
      return { ok: false, error: 'El adjunto no es un audio válido.', status: 400 };
    }
    if (media.buffer.byteLength > MAX_STT_AUDIO_BYTES) {
      return { ok: false, error: 'El audio supera el límite de 16 MB para transcripción.', status: 400 };
    }

    const transcript = await withOneRetry(() => geminiTranscribeAudio({
      apiKey,
      buffer: media.buffer,
      mimeType: media.mimeType,
    }));

    await supabase.from('whatsapp_message_log').update({
      voice_transcription: transcript,
      voice_transcription_at: new Date().toISOString(),
      voice_transcription_model: resolveGeminiModel('GEMINI_MODEL_TRANSCRIBE', DEFAULT_GEMINI_MODEL),
      voice_transcription_mime_type: media.mimeType,
      voice_transcription_bytes: media.buffer.byteLength,
      voice_transcription_status: 'completed',
      voice_transcription_error: null,
      voice_transcription_failed_at: null,
    }).eq('id', messageLogId);

    return { ok: true, cached: false, transcript };
  } catch (error) {
    const message = formatUnknownError(error);
    await supabase.from('whatsapp_message_log').update({
      voice_transcription_status: 'failed',
      voice_transcription_error: message,
      voice_transcription_failed_at: new Date().toISOString(),
    }).eq('id', messageLogId);
    return { ok: false, error: message, status: 500 };
  }
}
