// whatsapp-storage-monitor: API unificada del monitor de Storage WhatsApp.
// Dashboard, ranking paginado, análisis, optimización con dry-run y audit log.

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { formatError } from '../_shared/errors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { computeSha256Hex, WHATSAPP_MEDIA_BUCKET } from '../_shared/whatsappMediaStorage.ts';
import { PLAN_FREE_STORAGE_BYTES } from '../_shared/storageLimits.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;
// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export const OPTIMIZE_DUPLICATE_PDFS_CONFIRM = 'OPTIMIZAR_PDFS_DUPLICADOS';
export const OPTIMIZE_STALE_CATALOG_CONFIRM = 'OPTIMIZAR_CATALOGOS_ANTIGUOS';
export const DELETE_CONVERSATION_MEDIA_CONFIRM = 'ELIMINAR_MEDIA_CONVERSACION';
export const RECONCILE_STORAGE_INDEX_CONFIRM = 'RECONCILIAR_INDICE_STORAGE';

const SHA_BACKFILL_BATCH = 25;
const BACKFILL_MAX_ITERATIONS = 20;

interface CopyRow {
  asset_id: string;
  storage_path: string;
  conversation_stable_key: string;
  size_bytes: number;
  created_at: string;
  message_log_id?: string;
}

interface DuplicateGroup {
  group_id: string;
  detection_method: string;
  copy_count: number;
  total_bytes: number;
  copies: CopyRow[];
  redundant_copies: number;
  bytes_reclaimable: number;
}

async function logOptimization(
  supabase: SupabaseClient,
  params: {
    action: string;
    dryRun: boolean;
    bytesFreed: number;
    objectsAffected: number;
    details: Record<string, unknown>;
    executedBy: string;
  },
): Promise<void> {
  await supabase.from('whatsapp_storage_optimization_log').insert({
    action: params.action,
    dry_run: params.dryRun,
    bytes_freed: params.bytesFreed,
    objects_affected: params.objectsAffected,
    details: params.details,
    executed_by: params.executedBy,
  });
}

function mapRankingRow(row: Row) {
  return {
    stableKey: row.stable_key,
    contactName: row.contact_name ?? null,
    contactPhone: row.contact_phone ?? null,
    messageCount: row.message_count ?? 0,
    mediaCount: row.media_count ?? 0,
    totalBytes: row.total_bytes ?? 0,
    lastMessageAt: row.last_message_at ?? null,
  };
}

function mapStorageStats(json: Row) {
  const breakdown = json.breakdown ?? {};
  return {
    totalObjects: json.total_objects ?? 0,
    totalBytes: json.total_bytes ?? 0,
    bucketLimit: PLAN_FREE_STORAGE_BYTES,
    usedPercent: Math.min(100, +((json.total_bytes ?? 0) / PLAN_FREE_STORAGE_BYTES * 100).toFixed(1)),
    freeBytes: PLAN_FREE_STORAGE_BYTES - (json.total_bytes ?? 0),
    freePercent: Math.min(100, +(((PLAN_FREE_STORAGE_BYTES - (json.total_bytes ?? 0)) / PLAN_FREE_STORAGE_BYTES) * 100).toFixed(1)),
    breakdown: {
      image: breakdown.image ?? { count: 0, bytes: 0 },
      video: breakdown.video ?? { count: 0, bytes: 0 },
      audio: breakdown.audio ?? { count: 0, bytes: 0 },
      document: breakdown.document ?? { count: 0, bytes: 0 },
      text: breakdown.text ?? { count: 0, bytes: 0 },
      other: breakdown.other ?? { count: 0, bytes: 0 },
    },
  };
}

async function handleDashboard(supabase: SupabaseClient) {
  const [statsRes, overviewRes, rankingRes, suggestionsRes] = await Promise.all([
    supabase.rpc('get_storage_stats', { p_bucket: WHATSAPP_MEDIA_BUCKET }),
    supabase.rpc('get_storage_overview'),
    supabase.rpc('get_conversation_storage_ranking', { p_limit: 10, p_offset: 0, p_sort: 'bytes' }),
    supabase.rpc('get_storage_suggestions'),
  ]);

  if (statsRes.error) throw new Error(`get_storage_stats: ${statsRes.error.message ?? JSON.stringify(statsRes.error)}`);
  if (overviewRes.error) throw new Error(`get_storage_overview: ${overviewRes.error.message ?? JSON.stringify(overviewRes.error)}`);
  if (rankingRes.error) throw new Error(`get_conversation_storage_ranking: ${rankingRes.error.message ?? JSON.stringify(rankingRes.error)}`);
  if (suggestionsRes.error) throw new Error(`get_storage_suggestions: ${suggestionsRes.error.message ?? JSON.stringify(suggestionsRes.error)}`);

  const rankingJson = rankingRes.data as { rows?: Row[]; total_count?: number };
  return {
    storage: mapStorageStats(statsRes.data as Row),
    overview: overviewRes.data,
    heavyChats: (rankingJson.rows ?? []).map(mapRankingRow),
    rankingTotalCount: rankingJson.total_count ?? 0,
    suggestions: suggestionsRes.data ?? [],
  };
}

async function handleRanking(
  supabase: SupabaseClient,
  body: Row,
) {
  const limit = Math.min(Math.max(Number(body.limit ?? 20), 1), 100);
  const offset = Math.max(Number(body.offset ?? 0), 0);
  const sort = String(body.sort ?? 'bytes');

  const { data, error } = await supabase.rpc('get_conversation_storage_ranking', {
    p_limit: limit,
    p_offset: offset,
    p_sort: sort,
  });
  if (error) throw error;

  const json = data as { rows?: Row[]; total_count?: number };
  return {
    rows: (json.rows ?? []).map(mapRankingRow),
    totalCount: json.total_count ?? 0,
    limit,
    offset,
    sort,
  };
}

async function handleAnalyze(supabase: SupabaseClient, body: Row) {
  const minAgeDays = Number(body.minAgeDays ?? 14);
  const [duplicatesRes, orphansRes] = await Promise.all([
    supabase.rpc('get_duplicate_pdf_groups', { p_min_age_days: minAgeDays }),
    supabase.rpc('get_storage_orphans'),
  ]);
  if (duplicatesRes.error) throw duplicatesRes.error;
  if (orphansRes.error) throw orphansRes.error;

  const groups = (duplicatesRes.data ?? []) as DuplicateGroup[];
  const bytesReclaimable = groups.reduce((sum, g) => sum + (g.bytes_reclaimable ?? 0), 0);
  const redundantCopies = groups.reduce((sum, g) => sum + (g.redundant_copies ?? 0), 0);

  return {
    duplicateGroups: groups,
    orphans: orphansRes.data,
    preview: {
      bytesReclaimable,
      redundantCopies,
      uniquePdfGroups: groups.length,
    },
  };
}

function selectRedundantCopies(groups: DuplicateGroup[]): CopyRow[] {
  const toDelete: CopyRow[] = [];
  for (const group of groups) {
    const copies = [...(group.copies ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const keepPerChat = new Map<string, CopyRow>();
    for (const copy of copies) {
      const key = copy.conversation_stable_key;
      if (!keepPerChat.has(key)) keepPerChat.set(key, copy);
    }
    const keepIds = new Set([...keepPerChat.values()].map((c) => c.asset_id));
    for (const copy of copies) {
      if (!keepIds.has(copy.asset_id)) toDelete.push(copy);
    }
  }
  return toDelete;
}

function selectStaleCatalogCopies(
  groups: DuplicateGroup[],
  minAgeDays: number,
): CopyRow[] {
  const cutoff = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;
  const toDelete: CopyRow[] = [];
  for (const group of groups) {
    if (group.detection_method !== 'sha256') continue;
    const copies = [...(group.copies ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const newest = copies[0];
    if (!newest || new Date(newest.created_at).getTime() > cutoff) continue;
    const keepPerChat = new Map<string, CopyRow>();
    for (const copy of copies) {
      const key = copy.conversation_stable_key;
      if (!keepPerChat.has(key)) keepPerChat.set(key, copy);
    }
    const keepIds = new Set([...keepPerChat.values()].map((c) => c.asset_id));
    for (const copy of copies) {
      if (!keepIds.has(copy.asset_id) && new Date(copy.created_at).getTime() < cutoff) {
        toDelete.push(copy);
      }
    }
  }
  return toDelete;
}

async function deleteMediaCopies(
  supabase: SupabaseClient,
  copies: CopyRow[],
  dryRun: boolean,
): Promise<{ bytesFreed: number; objectsAffected: number; paths: string[] }> {
  let bytesFreed = 0;
  const paths: string[] = [];
  for (const copy of copies) {
    bytesFreed += copy.size_bytes ?? 0;
    paths.push(copy.storage_path);
    if (!dryRun) {
      await supabase.storage.from(WHATSAPP_MEDIA_BUCKET).remove([copy.storage_path]);
      await supabase.from('whatsapp_media_assets').delete().eq('id', copy.asset_id);
      if (copy.message_log_id) {
        await supabase.from('whatsapp_message_log').update({
          storage_path: null,
          storage_url: null,
          media_url: null,
        }).eq('id', copy.message_log_id);
      }
    }
  }
  return { bytesFreed, objectsAffected: copies.length, paths };
}

async function handleOptimizeDuplicatePdfs(
  supabase: SupabaseClient,
  userRpc: SupabaseClient,
  userId: string,
  body: Row,
) {
  const dryRun = body.dryRun !== false;
  const confirmation = String(body.confirmPhrase ?? '').trim();
  if (!dryRun && confirmation !== OPTIMIZE_DUPLICATE_PDFS_CONFIRM) {
    return jsonResponse({ error: 'Confirmación incorrecta.' }, 400);
  }

  const minAgeDays = Number(body.minAgeDays ?? 14);
  const { data, error } = await userRpc.rpc('get_duplicate_pdf_groups', { p_min_age_days: minAgeDays });
  if (error) throw error;

  const groups = (data ?? []) as DuplicateGroup[];
  const copies = selectRedundantCopies(groups);
  const result = await deleteMediaCopies(supabase, copies, dryRun);

  await logOptimization(supabase, {
    action: 'optimize_duplicate_pdfs',
    dryRun,
    bytesFreed: result.bytesFreed,
    objectsAffected: result.objectsAffected,
    details: { paths: result.paths.slice(0, 50), groupCount: groups.length },
    executedBy: userId,
  });

  return {
    dryRun,
    bytesFreed: result.bytesFreed,
    objectsAffected: result.objectsAffected,
    uniquePdfGroups: groups.length,
    previewPaths: result.paths.slice(0, 20),
  };
}

async function handleOptimizeStaleCatalogPdfs(
  supabase: SupabaseClient,
  userRpc: SupabaseClient,
  userId: string,
  body: Row,
) {
  const dryRun = body.dryRun !== false;
  const confirmation = String(body.confirmPhrase ?? '').trim();
  if (!dryRun && confirmation !== OPTIMIZE_STALE_CATALOG_CONFIRM) {
    return jsonResponse({ error: 'Confirmación incorrecta.' }, 400);
  }

  const minAgeDays = Number(body.minAgeDays ?? 30);
  const { data, error } = await userRpc.rpc('get_duplicate_pdf_groups', { p_min_age_days: minAgeDays });
  if (error) throw error;

  const groups = (data ?? []) as DuplicateGroup[];
  const copies = selectStaleCatalogCopies(groups, minAgeDays);
  const result = await deleteMediaCopies(supabase, copies, dryRun);

  await logOptimization(supabase, {
    action: 'optimize_stale_catalog_pdfs',
    dryRun,
    bytesFreed: result.bytesFreed,
    objectsAffected: result.objectsAffected,
    details: { paths: result.paths.slice(0, 50), minAgeDays },
    executedBy: userId,
  });

  return {
    dryRun,
    bytesFreed: result.bytesFreed,
    objectsAffected: result.objectsAffected,
    previewPaths: result.paths.slice(0, 20),
  };
}

async function handleDeleteConversationMedia(
  supabase: SupabaseClient,
  userId: string,
  body: Row,
) {
  const dryRun = body.dryRun !== false;
  const confirmation = String(body.confirmPhrase ?? '').trim();
  const stableKey = String(body.stableKey ?? body.conversationId ?? '').trim();

  if (!stableKey) return jsonResponse({ error: 'stableKey requerido.' }, 400);
  if (!dryRun && confirmation !== DELETE_CONVERSATION_MEDIA_CONFIRM) {
    return jsonResponse({ error: 'Confirmación incorrecta.' }, 400);
  }

  const { data: assets, error } = await supabase
    .from('whatsapp_media_assets')
    .select('id, storage_path, size_bytes, message_log_id')
    .eq('conversation_stable_key', stableKey)
    .eq('bucket_id', WHATSAPP_MEDIA_BUCKET);
  if (error) throw error;

  const copies = (assets ?? []).map((a: Row) => ({
    asset_id: a.id,
    storage_path: a.storage_path,
    conversation_stable_key: stableKey,
    size_bytes: a.size_bytes ?? 0,
    created_at: '',
    message_log_id: a.message_log_id,
  }));

  const result = await deleteMediaCopies(supabase, copies, dryRun);

  await logOptimization(supabase, {
    action: 'delete_conversation_media',
    dryRun,
    bytesFreed: result.bytesFreed,
    objectsAffected: result.objectsAffected,
    details: { stableKey },
    executedBy: userId,
  });

  return {
    dryRun,
    stableKey,
    bytesFreed: result.bytesFreed,
    objectsAffected: result.objectsAffected,
  };
}

async function handleBackfillMetadata(
  supabase: SupabaseClient,
  userRpc: SupabaseClient,
  userId: string,
  body: Row,
) {
  const dryRun = body.dryRun !== false;
  const batchLimit = Math.min(Math.max(Number(body.batchLimit ?? 500), 1), 1000);
  const maxIterations = Math.min(Math.max(Number(body.maxIterations ?? BACKFILL_MAX_ITERATIONS), 1), 50);

  let iterations = 0;
  let totalUpdated = 0;
  let remainingCandidates = 0;
  let hasMore = false;
  let lastSizeBackfill: Row = {};

  while (iterations < maxIterations) {
    const sizeResult = await userRpc.rpc('backfill_media_metadata', {
      p_dry_run: dryRun,
      p_batch_limit: batchLimit,
    });
    if (sizeResult.error) throw sizeResult.error;

    const payload = (sizeResult.data ?? {}) as Row;
    lastSizeBackfill = payload;
    iterations += 1;
    totalUpdated += Number(payload.updated ?? 0);
    remainingCandidates = Number(payload.remaining_candidates ?? 0);
    hasMore = Boolean(payload.has_more);

    if (dryRun || !hasMore || Number(payload.candidates ?? 0) === 0) break;
  }

  let shaUpdated = 0;
  if (!dryRun && body.includeSha256 === true) {
    const { data: missing } = await supabase
      .from('whatsapp_media_assets')
      .select('id, storage_path, bucket_id')
      .eq('bucket_id', WHATSAPP_MEDIA_BUCKET)
      .is('sha256', null)
      .limit(SHA_BACKFILL_BATCH);

    for (const row of missing ?? []) {
      const { data: blob, error: dlError } = await supabase.storage
        .from(row.bucket_id)
        .download(row.storage_path);
      if (dlError || !blob) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const sha256 = await computeSha256Hex(bytes);
      const { error: upError } = await supabase
        .from('whatsapp_media_assets')
        .update({ sha256, size_bytes: bytes.byteLength })
        .eq('id', row.id);
      if (!upError) shaUpdated += 1;
    }
  }

  await logOptimization(supabase, {
    action: 'backfill_metadata',
    dryRun,
    bytesFreed: 0,
    objectsAffected: totalUpdated,
    details: { sizeBackfill: lastSizeBackfill, shaUpdated, iterations, remainingCandidates },
    executedBy: userId,
  });

  return {
    dryRun,
    sizeBackfill: lastSizeBackfill,
    iterations,
    totalUpdated,
    remainingCandidates,
    hasMore,
    shaUpdated,
  };
}

async function handleReconcileIndex(
  supabase: SupabaseClient,
  userRpc: SupabaseClient,
  userId: string,
  body: Row,
) {
  const dryRun = body.dryRun !== false;
  const confirmation = String(body.confirmPhrase ?? '').trim();
  const batchLimit = Math.min(Math.max(Number(body.batchLimit ?? 200), 1), 500);
  const maxIterations = Math.min(Math.max(Number(body.maxIterations ?? 10), 1), 20);

  if (!dryRun && confirmation !== RECONCILE_STORAGE_INDEX_CONFIRM) {
    return jsonResponse({ error: 'Confirmación incorrecta.' }, 400);
  }

  let iterations = 0;
  let totalInserted = 0;
  let totalUpdatedLogs = 0;
  let remainingOrphans = 0;
  let hasMore = false;
  let lastResult: Row = {};

  while (iterations < maxIterations) {
    const { data, error } = await userRpc.rpc('reconcile_storage_index', {
      p_dry_run: dryRun,
      p_batch_limit: batchLimit,
    });
    if (error) throw error;

    const payload = (data ?? {}) as Row;
    lastResult = payload;
    iterations += 1;
    totalInserted += Number(payload.inserted_assets ?? 0);
    totalUpdatedLogs += Number(payload.updated_logs ?? 0);
    remainingOrphans = Number(payload.remaining_orphans ?? 0);
    hasMore = Boolean(payload.has_more);

    if (dryRun || !hasMore || Number(payload.inserted_assets ?? 0) === 0) break;
  }

  await logOptimization(supabase, {
    action: 'reconcile_index',
    dryRun,
    bytesFreed: 0,
    objectsAffected: totalInserted,
    details: {
      updatedLogs: totalUpdatedLogs,
      remainingOrphans,
      iterations,
      lastResult,
    },
    executedBy: userId,
  });

  return {
    dryRun,
    insertedAssets: totalInserted,
    updatedLogs: totalUpdatedLogs,
    remainingOrphans,
    iterations,
    hasMore,
    lastResult,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, userRpc, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'dashboard').trim();

    let result: unknown;
    switch (action) {
      case 'dashboard':
        result = await handleDashboard(userRpc);
        break;
      case 'ranking':
        result = await handleRanking(userRpc, body);
        break;
      case 'analyze':
        result = await handleAnalyze(userRpc, body);
        break;
      case 'optimize_duplicate_pdfs':
        result = await handleOptimizeDuplicatePdfs(supabase, userRpc, user.id, body);
        if (result instanceof Response) return result;
        break;
      case 'optimize_stale_catalog_pdfs':
        result = await handleOptimizeStaleCatalogPdfs(supabase, userRpc, user.id, body);
        if (result instanceof Response) return result;
        break;
      case 'delete_conversation_media':
        result = await handleDeleteConversationMedia(supabase, user.id, body);
        if (result instanceof Response) return result;
        break;
      case 'backfill_metadata':
        result = await handleBackfillMetadata(supabase, userRpc, user.id, body);
        break;
      case 'reconcile_index':
        result = await handleReconcileIndex(supabase, userRpc, user.id, body);
        if (result instanceof Response) return result;
        break;
      default:
        return jsonResponse({ error: `Acción desconocida: ${action}` }, 400);
    }

    return jsonResponse(result);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error('[whatsapp-storage-monitor]', formatError(error), error);
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
