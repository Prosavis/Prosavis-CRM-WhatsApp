import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError, WHATSAPP_API_VERSION } from '../_shared/whatsappOutbound.ts';
import {
  DEFAULT_TRANSCRIBE_MODEL,
  getNvidiaApiKey,
  llmTranscribeAudio,
  resolveNvidiaModel,
} from '../_shared/llmClient.ts';

const MAX_STT_AUDIO_BYTES = 16 * 1024 * 1024;

function isVoiceTranscriptionEnabled(): boolean {
  const value = Deno.env.get('FEATURE_WHATSAPP_VOICE_TRANSCRIPTION_ENABLED');
  return !value || !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
}

async function downloadWhatsAppMediaBinary(mediaId: string, accessToken: string) {
  const metaRes = await fetch(`https://graph.facebook.com/${WHATSAPP_API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const metaJson = await metaRes.json();
  if (!metaRes.ok) throw new Error(metaJson?.error?.message ?? 'Error Meta media');
  const url = String(metaJson.url ?? '');
  const mimeType = String(metaJson.mime_type ?? 'audio/ogg');
  if (!url) throw new Error('URL de media no disponible');
  const blobRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!blobRes.ok) throw new Error('No se pudo descargar media de Meta');
  const buffer = new Uint8Array(await blobRes.arrayBuffer());
  return { buffer, mimeType };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const messageLogId = String(body.messageLogId ?? '').trim();
    const force = body.force === true;

    if (!isVoiceTranscriptionEnabled()) {
      return jsonResponse({ error: 'La transcripción de audios está desactivada temporalmente.' }, 412);
    }
    if (!messageLogId) return jsonResponse({ error: 'Se requiere messageLogId.' }, 400);

    const { data: row, error: readError } = await supabase
      .from('whatsapp_message_log')
      .select('*')
      .eq('id', messageLogId)
      .single();
    if (readError) throw readError;

    if (row.direction !== 'inbound' || row.media_type !== 'audio' || !row.media_id) {
      return jsonResponse({ error: 'Solo se pueden transcribir audios inbound con mediaId.' }, 400);
    }

    if (row.voice_transcription && !force) {
      return jsonResponse({ success: true, transcript: row.voice_transcription, cached: true });
    }

    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN')?.trim();
    const apiKey = getNvidiaApiKey();
    if (!accessToken) return jsonResponse({ error: 'WHATSAPP_ACCESS_TOKEN no configurado.' }, 412);
    if (!apiKey) return jsonResponse({ error: 'NVIDIA_API_KEY no configurada.' }, 412);

    const transcriptionModel = resolveNvidiaModel('NVIDIA_MODEL_TRANSCRIBE', DEFAULT_TRANSCRIBE_MODEL);

    try {
      const media = await downloadWhatsAppMediaBinary(String(row.media_id), accessToken);
      if (!media.mimeType.startsWith('audio/')) {
        return jsonResponse({ error: 'El adjunto no es un audio válido.' }, 400);
      }
      if (media.buffer.byteLength > MAX_STT_AUDIO_BYTES) {
        return jsonResponse({ error: 'El audio supera el límite de 16 MB para transcripción.' }, 400);
      }

      const transcript = await llmTranscribeAudio({
        apiKey,
        buffer: media.buffer,
        mimeType: media.mimeType,
        model: transcriptionModel,
      });

      await supabase.from('whatsapp_message_log').update({
        voice_transcription: transcript,
        voice_transcription_at: new Date().toISOString(),
        voice_transcription_model: transcriptionModel,
        voice_transcription_mime_type: media.mimeType,
        voice_transcription_bytes: media.buffer.byteLength,
        voice_transcription_status: 'completed',
        voice_transcription_error: null,
        voice_transcription_failed_at: null,
      }).eq('id', messageLogId);

      return jsonResponse({ success: true, transcript, cached: false });
    } catch (error) {
      const message = formatError(error);
      await supabase.from('whatsapp_message_log').update({
        voice_transcription_status: 'failed',
        voice_transcription_error: message,
        voice_transcription_failed_at: new Date().toISOString(),
      }).eq('id', messageLogId);
      return jsonResponse({ error: message }, 500);
    }
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
