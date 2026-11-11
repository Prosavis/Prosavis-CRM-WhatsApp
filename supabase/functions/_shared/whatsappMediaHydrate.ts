import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { scheduleBackgroundWork } from './edgeBackground.ts';
import { analyzeInboundImageById } from './analyzeInboundImage.ts';
import { inboundAudioNeedsAutoTranscription } from './inboxAiMediaLimits.ts';
import {
  isVoiceTranscriptionEnabled,
  transcribeInboundAudioById,
} from './transcribeInboundAudio.ts';
import {
  buildStoragePath,
  downloadWhatsAppMediaFromMeta,
  getWhatsAppAccessToken,
  OUTBOUND_META_SIGNED_URL_EXPIRES_SECONDS,
  persistToWhatsAppBucket,
  WhatsAppMediaError,
} from './whatsappMediaStorage.ts';

export async function persistInboundMedia(params: {
  supabase: SupabaseClient;
  mediaId: string;
  mimeType: string | null;
  stableKey: string;
}): Promise<{
  storagePath: string | null;
  storageUrl: string | null;
  fileSize: number | null;
  sha256: string | null;
}> {
  if (!getWhatsAppAccessToken()) {
    console.error('[whatsapp-media] persistInboundMedia: WHATSAPP_ACCESS_TOKEN ausente', {
      mediaId: params.mediaId,
    });
    return { storagePath: null, storageUrl: null, fileSize: null, sha256: null };
  }

  try {
    const { bytes, mimeType } = await downloadWhatsAppMediaFromMeta(params.mediaId);
    const resolvedMimeType = mimeType || params.mimeType || 'application/octet-stream';
    const storagePath = buildStoragePath(params.stableKey, params.mediaId, resolvedMimeType);
    const persisted = await persistToWhatsAppBucket(
      params.supabase,
      bytes,
      storagePath,
      resolvedMimeType,
      OUTBOUND_META_SIGNED_URL_EXPIRES_SECONDS,
    );
    return {
      storagePath: persisted.storagePath,
      storageUrl: persisted.signedUrl,
      fileSize: persisted.fileSize,
      sha256: persisted.sha256,
    };
  } catch (error) {
    const details =
      error instanceof WhatsAppMediaError
        ? { code: error.code, statusCode: error.statusCode, message: error.message }
        : { message: String(error) };
    console.error('[whatsapp-media] persistInboundMedia failed', {
      mediaId: params.mediaId,
      stableKey: params.stableKey,
      ...details,
    });
    return { storagePath: null, storageUrl: null, fileSize: null, sha256: null };
  }
}

export async function queuePersistedAudioTranscription(
  supabase: SupabaseClient,
  messageLogId: string,
): Promise<void> {
  if (!isVoiceTranscriptionEnabled() || !messageLogId) return;
  await supabase.from('whatsapp_message_log').update({
    voice_transcription_status: 'pending',
  }).eq('id', messageLogId);
  scheduleBackgroundWork(
    transcribeInboundAudioById(supabase, messageLogId),
    'auto-stt',
  );
}

function shouldQueueInboundVision(
  mediaType: string | null,
  mimeType: string | null,
): boolean {
  const type = (mediaType ?? '').toLowerCase();
  const mime = (mimeType ?? '').toLowerCase();
  if (type === 'image') return true;
  return type === 'document' && mime.includes('pdf');
}

export async function hydratePersistedMessageMedia(params: {
  supabase: SupabaseClient;
  messageLogId: string | null;
  stableKey: string;
  mediaId: string | null;
  mediaType: string | null;
  mimeType: string | null;
}): Promise<void> {
  const messageLogId = params.messageLogId;
  if (!params.mediaId || !messageLogId) return;

  const persisted = await persistInboundMedia({
    supabase: params.supabase,
    mediaId: params.mediaId,
    mimeType: params.mimeType,
    stableKey: params.stableKey,
  });

  if (persisted.storagePath) {
    const { error: mediaUpdateError } = await params.supabase
      .from('whatsapp_message_log')
      .update({
        storage_path: persisted.storagePath,
        storage_url: persisted.storageUrl,
        media_url: persisted.storageUrl,
        mime_type: params.mimeType,
        size_bytes: persisted.fileSize,
      })
      .eq('id', messageLogId);
    if (mediaUpdateError) {
      console.error('[whatsapp-media] message media update failed', {
        messageLogId: messageLogId,
        mediaId: params.mediaId,
        error: mediaUpdateError,
      });
    }

    if (!mediaUpdateError && shouldQueueInboundVision(params.mediaType, params.mimeType)) {
      scheduleBackgroundWork(
        analyzeInboundImageById(params.supabase, messageLogId),
        'auto-image-analysis',
      );
    }

    await params.supabase.from('whatsapp_media_assets').insert({
      message_log_id: messageLogId,
      conversation_stable_key: params.stableKey,
      bucket_id: 'whatsapp-media',
      storage_path: persisted.storagePath,
      media_id: params.mediaId,
      mime_type: params.mimeType,
      size_bytes: persisted.fileSize,
      sha256: persisted.sha256,
    });
  }

  if (
    inboundAudioNeedsAutoTranscription({
      mediaType: params.mediaType,
      messageLogId: messageLogId,
      mediaId: params.mediaId,
      storagePath: persisted.storagePath,
    }) &&
    isVoiceTranscriptionEnabled()
  ) {
    await queuePersistedAudioTranscription(params.supabase, messageLogId);
  }
}
