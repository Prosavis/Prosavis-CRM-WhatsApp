import { loadAllDocs } from '../lib/firestore-reader.js';
import {
  hydrateLeadIdMap,
  hydrateTagIdMap,
  mapAdminUid,
  remapTagIds,
  type MigrationContext,
} from '../lib/migration-context.js';
import { firebaseIdToUuid } from '../lib/id-mapper.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migrateConversations(
  ctx: MigrationContext,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  await hydrateTagIdMap(ctx);

  const docs = await loadAllDocs('whatsapp_conversations');
  const rows: Record<string, unknown>[] = [];

  for (const doc of docs) {
    const data = doc.data();
    const stableKey = doc.id;
    const metadata: Record<string, unknown> = {};

    if (data.consecutiveOtherCount != null) metadata.consecutiveOtherCount = data.consecutiveOtherCount;
    if (data.escalatedAt) metadata.escalatedAt = firestoreTimestampToIso(data.escalatedAt);
    if (data.escalatedTo) metadata.escalatedTo = data.escalatedTo;

    rows.push({
      id: firebaseIdToUuid('whatsapp_conversations', stableKey),
      stable_key: stableKey,
      phone: data.phone ?? null,
      bsuid: data.bsuid ?? null,
      parent_bsuid: data.parentBsuid ?? null,
      state: data.state ?? 'active',
      contact_name: data.contactName ?? null,
      contact_phone: data.contactPhone ?? data.phone ?? null,
      contact_photo_url: data.contactPhotoUrl ?? null,
      whatsapp_profile_name: data.whatsappProfileName ?? null,
      admin_notes: data.adminNotes ?? null,
      assigned_to: mapAdminUid(ctx, data.assignedTo as string | undefined),
      last_message_text: data.lastMessageText ?? null,
      last_message_at: firestoreTimestampToIso(data.lastMessageAt ?? data.lastUpdated),
      last_message_direction: data.lastMessageDirection ?? null,
      last_message_outbound_status: data.lastMessageOutboundStatus ?? null,
      unread_count: data.unreadCount ?? 0,
      phone_number_id: data.phoneNumberId ?? null,
      automated_inbound_disabled: data.automatedInboundDisabled === true,
      tag_ids: remapTagIds(ctx, data.tagIds as string[] | undefined),
      is_archived: data.isArchived === true,
      archived_at: firestoreTimestampToIso(data.archivedAt),
      is_pinned: data.isPinned === true,
      pinned_at: firestoreTimestampToIso(data.pinnedAt),
      crm_force_unread: data.crmForceUnread === true,
      user_id: data.userId ?? null,
      last_intent: data.lastIntent ?? null,
      metadata,
      created_at: firestoreTimestampToIso(data.createdAt ?? data.lastUpdated) ?? new Date().toISOString(),
      updated_at: firestoreTimestampToIso(data.lastUpdated ?? data.createdAt) ?? new Date().toISOString(),
    });
  }

  if (options.dryRun) {
    return { table: 'whatsapp_conversations', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('whatsapp_conversations', rows, { onConflict: 'stable_key' });
}
