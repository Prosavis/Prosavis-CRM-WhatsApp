import { loadAllDocs } from '../lib/firestore-reader.js';
import { firestoreTimestampToIso } from '../lib/timestamp.js';
import { upsertRows } from '../lib/supabase-writer.js';
import type { ExportStepOptions, MapperResult } from './types.js';

export async function migrateFaqs(
  _ctx: unknown,
  options: ExportStepOptions = {}
): Promise<MapperResult> {
  const docs = await loadAllDocs('faqs');
  const rows = docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
      question: data.question ?? '',
      answer: data.answer ?? '',
      category: data.category ?? null,
      is_active: data.isActive !== false,
      created_at: firestoreTimestampToIso(data.createdAt) ?? new Date().toISOString(),
      updated_at: firestoreTimestampToIso(data.updatedAt) ?? new Date().toISOString(),
    };
  });

  if (options.dryRun) {
    return { table: 'crm_faqs', attempted: rows.length, upserted: 0, errors: [] };
  }

  return upsertRows('crm_faqs', rows, { onConflict: 'id' });
}
