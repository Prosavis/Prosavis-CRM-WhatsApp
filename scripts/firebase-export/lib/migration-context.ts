import { buildAdminUidMap, type AdminUidMap } from './admin-mapper.js';
import { initFirebaseAdmin } from './firestore-reader.js';
import { buildIdMapEntry, firebaseIdToUuid } from './id-mapper.js';
import { upsertIdMap } from './supabase-writer.js';

export type MigrationContext = {
  adminMap: AdminUidMap;
  /** Firebase tag doc id → Supabase uuid */
  tagIdMap: Map<string, string>;
  /** Firebase lead doc id → Supabase uuid */
  leadIdMap: Map<string, string>;
  warnings: string[];
};

export async function createMigrationContext(): Promise<MigrationContext> {
  initFirebaseAdmin();
  const { map: adminMap, warnings: adminWarnings } = await buildAdminUidMap();

  return {
    adminMap,
    tagIdMap: new Map(),
    leadIdMap: new Map(),
    warnings: adminWarnings.map(
      (w) => `[admin-map] ${w.firebaseUid}${w.email ? ` (${w.email})` : ''}: ${w.reason}`
    ),
  };
}

export function mapAdminUid(
  ctx: MigrationContext,
  firebaseUid: string | null | undefined
): string | null {
  if (!firebaseUid || firebaseUid === 'system') return null;
  const mapped = ctx.adminMap.get(firebaseUid);
  if (!mapped) {
    ctx.warnings.push(`[admin-map] UID sin match Supabase: ${firebaseUid}`);
  }
  return mapped ?? null;
}

export function rememberTagId(ctx: MigrationContext, firebaseId: string, supabaseId: string): void {
  ctx.tagIdMap.set(firebaseId, supabaseId);
}

export function rememberLeadId(ctx: MigrationContext, firebaseId: string, supabaseId: string): void {
  ctx.leadIdMap.set(firebaseId, supabaseId);
}

export function remapTagIds(
  ctx: MigrationContext,
  firebaseTagIds: string[] | undefined
): string[] {
  if (!firebaseTagIds?.length) return [];
  return firebaseTagIds
    .map((id) => ctx.tagIdMap.get(id) ?? firebaseIdToUuid('whatsapp_chat_tags', id))
    .filter(Boolean);
}

export async function hydrateTagIdMap(ctx: MigrationContext): Promise<void> {
  if (ctx.tagIdMap.size > 0) return;
  const { loadAllDocs } = await import('./firestore-reader.js');
  const docs = await loadAllDocs('whatsapp_chat_tags');
  for (const doc of docs) {
    rememberTagId(ctx, doc.id, firebaseIdToUuid('whatsapp_chat_tags', doc.id));
  }
}

export async function hydrateLeadIdMap(ctx: MigrationContext): Promise<void> {
  if (ctx.leadIdMap.size > 0) return;
  const { loadAllDocs } = await import('./firestore-reader.js');
  const docs = await loadAllDocs('leads');
  for (const doc of docs) {
    rememberLeadId(ctx, doc.id, firebaseIdToUuid('leads', doc.id));
  }
}

export async function persistIdMap(
  sourceCollection: string,
  firebaseId: string,
  supabaseId?: string
): Promise<string> {
  const entry = buildIdMapEntry(sourceCollection, firebaseId, supabaseId);
  await upsertIdMap([entry]);
  return entry.supabase_id;
}
