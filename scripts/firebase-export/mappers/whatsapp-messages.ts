import { iterateCollectionOrdered } from '../lib/firestore-reader.js';
import {
  hydrateLeadIdMap,
  mapAdminUid,
  type MigrationContext,
} from '../lib/migration-context.js';
import { firebaseIdToUuid } from '../lib/id-mapper.js';
import { isBsuid } from '../lib/normalize-phone.js';
import { resolveMessageStableKey } from '../lib/resolve-stable-key.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import {
  loadConversationStableKeys,
  loadExistingWaMessageIds,
  upsertRows,
} from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

const MEDIA_TYPES = new Set(['image', 'audio', 'video', 'document', 'sticker']);

function buildStubConversation(stableKey: string): Record<string, unknown> {
  const now = new Date().toISOString();
  const isBsuidKey = isBsuid(stableKey);

  return {
    id: firebaseIdToUuid('whatsapp_conversations', stableKey),
    stable_key: stableKey,
    phone: isBsuidKey ? null : stableKey,
    bsuid: isBsuidKey ? stableKey : null,
    state: 'active',
    contact_phone: isBsuidKey ? null : stableKey,
    unread_count: 0,
    automated_inbound_disabled: false,
    is_archived: false,
    is_pinned: false,
    crm_force_unread: false,
    metadata: { migrationStub: true },
    created_at: now,
    updated_at: now,
  };
}

export async function migrateMessageLog(
  ctx: MigrationContext,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  await hydrateLeadIdMap(ctx);

  const knownConversations = options.dryRun
    ? new Set<string>()
    : await loadConversationStableKeys();
  const seenWaMessageIds = options.dryRun
    ? new Set<string>()
    : await loadExistingWaMessageIds();
  const pendingStubs = new Map<string, Record<string, unknown>>();

  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  let upserted = 0;
  let stubsCreated = 0;
  const errors: string[] = [];
  let attempted = 0;

  const ensureConversation = (stableKey: string) => {
    if (knownConversations.has(stableKey)) return;
    if (!pendingStubs.has(stableKey)) {
      pendingStubs.set(stableKey, buildStubConversation(stableKey));
    }
  };

  const flushStubs = async () => {
    if (options.dryRun || pendingStubs.size === 0) return;

    const stubRows = [...pendingStubs.values()];
    const result = await upsertRows('whatsapp_conversations', stubRows, {
      onConflict: 'stable_key',
    });
    errors.push(...result.errors);
    stubsCreated += result.upserted;

    for (const stableKey of pendingStubs.keys()) {
      knownConversations.add(stableKey);
    }
    pendingStubs.clear();
  };

  for await (const batch of iterateCollectionOrdered(
    'whatsapp_message_log',
    'createdAt',
    500,
    options.since
  )) {
    for (const doc of batch) {
      attempted += 1;
      const data = doc.data() as Record<string, unknown>;
      const stableKey = resolveMessageStableKey(data);

      if (!stableKey) {
        skipped += 1;
        continue;
      }

      ensureConversation(stableKey);

      const leadFirebaseId = data.leadId as string | undefined;
      const leadId = leadFirebaseId
        ? ctx.leadIdMap.get(leadFirebaseId) ?? firebaseIdToUuid('leads', leadFirebaseId)
        : null;

      const mediaType = data.mediaType as string | undefined;
      const normalizedMediaType =
        mediaType && MEDIA_TYPES.has(mediaType) ? mediaType : null;

      const rawPayload: Record<string, unknown> = {};
      if (data.parameters) rawPayload.parameters = data.parameters;
      if (data.templateLanguage) rawPayload.templateLanguage = data.templateLanguage;
      if (data.sequenceStep != null) rawPayload.sequenceStep = data.sequenceStep;
      if (data.errorCode != null) rawPayload.errorCode = data.errorCode;
      if (data.recipientParentBsuid) rawPayload.recipientParentBsuid = data.recipientParentBsuid;

      let waMessageId =
        typeof data.waMessageId === 'string' && data.waMessageId.trim()
          ? data.waMessageId.trim()
          : null;

      if (waMessageId && seenWaMessageIds.has(waMessageId)) {
        rawPayload.duplicateWaMessageId = waMessageId;
        waMessageId = null;
      } else if (waMessageId) {
        seenWaMessageIds.add(waMessageId);
      }

      rows.push({
        id: firebaseIdToUuid('whatsapp_message_log', doc.id),
        conversation_stable_key: stableKey,
        recipient_phone: data.recipientPhone ?? null,
        recipient_bsuid: data.recipientBsuid ?? null,
        direction: data.direction ?? 'inbound',
        sender_type: data.senderType ?? 'agent',
        agent_uid: mapAdminUid(ctx, data.agentUid as string | undefined),
        message_body: data.messageBody ?? null,
        media_type: normalizedMediaType,
        media_id: data.mediaId ?? null,
        media_url: data.mediaUrl ?? null,
        storage_url: data.storageUrl ?? null,
        caption: data.caption ?? null,
        status: data.status ?? 'sent',
        wa_message_id: waMessageId,
        intent: data.intent ?? null,
        template_name: data.templateName ?? null,
        campaign_type: data.campaignType ?? null,
        phone_number_id: data.phoneNumberId ?? null,
        client_request_id: data.clientRequestId ?? null,
        reply_to_wa_message_id: data.replyToWaMessageId ?? null,
        filename: data.filename ?? null,
        batch_id: data.batchId ?? null,
        storage_path: data.storagePath ?? null,
        mime_type: data.mimeType ?? null,
        size_bytes: data.sizeBytes ?? null,
        reaction_to: data.reactionTo ?? null,
        reaction_removed: data.reactionRemoved === true,
        is_voice_note: data.isVoiceNote === true,
        location: data.location ?? null,
        contacts: data.contacts ?? null,
        batch_index: data.batchIndex ?? null,
        client_attachment_id: data.clientAttachmentId ?? null,
        voice_transcription: data.voiceTranscription ?? null,
        voice_transcription_at: firestoreTimestampToIso(data.voiceTranscriptionAt),
        voice_transcription_model: data.voiceTranscriptionModel ?? null,
        voice_transcription_mime_type: data.voiceTranscriptionMimeType ?? null,
        voice_transcription_bytes: data.voiceTranscriptionBytes ?? null,
        voice_transcription_status: data.voiceTranscriptionStatus ?? null,
        voice_transcription_error: data.voiceTranscriptionError ?? null,
        voice_transcription_failed_at: firestoreTimestampToIso(data.voiceTranscriptionFailedAt),
        lead_id: leadId,
        appointment_id: data.appointmentId ?? null,
        error_message: data.errorMessage ?? null,
        hidden_from_panel: data.hiddenFromPanel === true,
        revoked_at: firestoreTimestampToIso(data.revokedAt),
        revoked_reason: data.revokedReason ?? null,
        crm_deleted_at: firestoreTimestampToIso(data.crmDeletedAt),
        crm_deleted_by: mapAdminUid(ctx, data.crmDeletedBy as string | undefined),
        is_animated_sticker: data.isAnimatedSticker === true,
        raw_payload: rawPayload,
        created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
      });
    }

    if (!options.dryRun && pendingStubs.size >= 50) {
      await flushStubs();
    }

    if (!options.dryRun && rows.length >= 500) {
      await flushStubs();
      const chunk = rows.splice(0, rows.length);
      const result = await upsertRows('whatsapp_message_log', chunk, { onConflict: 'id' });
      errors.push(...result.errors);
      upserted += result.upserted;
    }
  }

  if (options.dryRun) {
    return {
      table: 'whatsapp_message_log',
      attempted,
      upserted: 0,
      errors: [],
      skipped,
    };
  }

  await flushStubs();

  if (rows.length > 0) {
    const result = await upsertRows('whatsapp_message_log', rows, { onConflict: 'id' });
    errors.push(...result.errors);
    upserted += result.upserted;
  }

  if (stubsCreated > 0) {
    console.log(`  conversaciones stub creadas: ${stubsCreated}`);
  }

  return {
    table: 'whatsapp_message_log',
    attempted,
    upserted,
    errors,
    skipped,
  };
}
