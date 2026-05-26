import { iterateChatMessages } from '../lib/firestore-reader.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migrateChatMessages(
  _ctx: unknown,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const rows: Record<string, unknown>[] = [];
  let attempted = 0;
  let upserted = 0;
  const errors: string[] = [];

  for await (const batch of iterateChatMessages(500)) {
    for (const { chatId, doc } of batch) {
      attempted += 1;
      const data = doc.data();
      rows.push({
        id: doc.id,
        chat_id: chatId,
        sender_id: data.senderId ?? '',
        sender_name: data.senderName ?? '',
        content: data.content ?? '',
        message_timestamp:
          firestoreTimestampToIso(data.timestamp) ?? new Date().toISOString(),
        is_read: data.isRead === true,
        message_type: data.type === 'system' ? 'system' : 'text',
        metadata: data.metadata && typeof data.metadata === 'object' ? data.metadata : {},
      });
    }

    if (!options.dryRun && rows.length >= 500) {
      const chunk = rows.splice(0, rows.length);
      const result = await upsertRows('crm_chat_messages', chunk, { onConflict: 'id' });
      upserted += result.upserted;
      errors.push(...result.errors);
    }
  }

  if (options.dryRun) {
    return { table: 'crm_chat_messages', attempted, upserted: 0, errors: [] };
  }

  if (rows.length > 0) {
    const final = await upsertRows('crm_chat_messages', rows, { onConflict: 'id' });
    upserted += final.upserted;
    errors.push(...final.errors);
  }

  return { table: 'crm_chat_messages', attempted, upserted, errors };
}
