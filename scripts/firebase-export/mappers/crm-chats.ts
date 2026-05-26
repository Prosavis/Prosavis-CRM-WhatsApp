import { loadAllDocs } from '../lib/firestore-reader.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migrateChats(
  _ctx: unknown,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllDocs('chats');
  const rows = docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      service_id: data.serviceId ?? '',
      service_title: data.serviceTitle ?? '',
      service_image: data.serviceImage ?? null,
      client_id: data.clientId ?? '',
      client_name: data.clientName ?? '',
      client_photo_url: data.clientPhotoUrl ?? null,
      provider_id: data.providerId ?? '',
      provider_name: data.providerName ?? '',
      provider_photo_url: data.providerPhotoUrl ?? null,
      last_message: data.lastMessage ?? '',
      last_message_timestamp: firestoreTimestampToIso(data.lastMessageTimestamp),
      unread_count_client: data.unreadCountClient ?? 0,
      unread_count_provider: data.unreadCountProvider ?? 0,
      expires_at: firestoreTimestampToIso(data.expiresAt),
      is_archived: data.isArchived === true,
      archived_at: firestoreTimestampToIso(data.archivedAt),
      context: data.context ?? null,
      is_system_chat: data.isSystemChat === true,
      provider_label_ids: Array.isArray(data.providerLabelIds) ? data.providerLabelIds : [],
      client_label_ids: Array.isArray(data.clientLabelIds) ? data.clientLabelIds : [],
      hidden_by_client: data.hiddenByClient === true,
      hidden_by_provider: data.hiddenByProvider === true,
      hidden_at: firestoreTimestampToIso(data.hiddenAt),
      metadata: {},
      created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
      updated_at: firestoreTimestampToIso(data.updatedAt) ?? new Date().toISOString(),
    };
  });

  if (options.dryRun) {
    return { table: 'crm_chats', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('crm_chats', rows, { onConflict: 'id' });
}
