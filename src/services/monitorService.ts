import { supabase } from '@/config/supabase';
import { getApp } from 'firebase/app';
import { PLAN_FREE_STORAGE_BYTES } from '@/constants/storageLimits';

// ──────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────

export interface MediaBreakdown {
  image: { count: number; bytes: number };
  video: { count: number; bytes: number };
  audio: { count: number; bytes: number };
  document: { count: number; bytes: number };
  text: { count: number; bytes: number };
  other: { count: number; bytes: number };
}

export interface StorageStats {
  totalObjects: number;
  totalBytes: number;
  bucketLimit: number;
  usedPercent: number;
  freeBytes: number;
  freePercent: number;
  breakdown: MediaBreakdown;
}

export interface StorageBucketOverview {
  bucketId: string;
  totalObjects: number;
  totalBytes: number;
  usedPercent: number;
}

export interface StorageOverview {
  planLimitBytes: number;
  totalBytes: number;
  usedPercent: number;
  freeBytes: number;
  buckets: StorageBucketOverview[];
}

export interface HeavyChat {
  stableKey: string;
  contactName: string | null;
  contactPhone: string | null;
  messageCount: number;
  mediaCount: number;
  totalBytes: number;
  lastMessageAt: string | null;
}

export type StorageSuggestionSeverity = 'critical' | 'warning' | 'info';

export interface StorageSuggestion {
  id: string;
  severity: StorageSuggestionSeverity;
  title: string;
  message: string;
  action: string;
}

export interface DuplicatePdfCopy {
  asset_id: string;
  storage_path: string;
  conversation_stable_key: string;
  size_bytes: number;
  created_at: string;
  message_log_id?: string;
  heuristic?: boolean;
}

export interface DuplicatePdfGroup {
  group_id: string;
  detection_method: 'sha256' | 'heuristic';
  copy_count: number;
  total_bytes: number;
  copies: DuplicatePdfCopy[];
  redundant_copies: number;
  bytes_reclaimable: number;
}

export interface StorageOrphans {
  storage_without_db: Array<{ storage_path: string; size_bytes: number; created_at: string }>;
  db_without_storage: Array<{ asset_id: string; storage_path: string; conversation_stable_key: string; size_bytes: number }>;
  storage_orphan_count: number;
  db_orphan_count: number;
}

export interface OptimizationPreview {
  bytesReclaimable: number;
  redundantCopies: number;
  uniquePdfGroups: number;
}

export interface GeneralMetrics {
  conversations: number;
  messages: number;
  leads: number;
  mediaAssets: number;
  clients: number;
  appointments: number;
  activeConversations: number;
  blocklisted: number;
  broadcastJobs: number;
  tags: number;
  adminProfiles: number;
}

export interface ConnectionStatus {
  supabase: { status: 'ok' | 'error' | 'checking'; latency?: number; error?: string };
  firebase: { status: 'ok' | 'error' | 'checking'; error?: string };
  whatsappApi: { status: 'ok' | 'error' | 'checking'; phoneNumberId?: string; error?: string };
}

export interface MonitorDashboard {
  storage: StorageStats | null;
  overview: StorageOverview | null;
  heavyChats: HeavyChat[];
  rankingTotalCount: number;
  suggestions: StorageSuggestion[];
  metrics: GeneralMetrics | null;
  connections: ConnectionStatus;
}

export type StorageMonitorAction =
  | 'dashboard'
  | 'ranking'
  | 'analyze'
  | 'optimize_duplicate_pdfs'
  | 'optimize_stale_catalog_pdfs'
  | 'delete_conversation_media'
  | 'backfill_metadata';

export const DELETE_CONVERSATION_MEDIA_CONFIRM = 'ELIMINAR_MEDIA_CONVERSACION';
export const OPTIMIZE_DUPLICATE_PDFS_CONFIRM = 'OPTIMIZAR_PDFS_DUPLICADOS';
export const OPTIMIZE_STALE_CATALOG_CONFIRM = 'OPTIMIZAR_CATALOGOS_ANTIGUOS';

type RankingSort = 'bytes' | 'messages' | 'date' | 'media';

interface EdgeDashboardResponse {
  storage: StorageStats;
  overview: StorageOverview;
  heavyChats: HeavyChat[];
  rankingTotalCount: number;
  suggestions: StorageSuggestion[];
}

// ──────────────────────────────────────────────
// Edge Function client
// ──────────────────────────────────────────────

async function invokeStorageMonitor<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('whatsapp-storage-monitor', { body });
  if (error) throw error;
  if (!data) throw new Error('Respuesta vacía del monitor de Storage');
  return data;
}

function mapOverview(raw: Record<string, unknown>): StorageOverview {
  const buckets = (raw.buckets as Array<Record<string, unknown>> | undefined) ?? [];
  return {
    planLimitBytes: Number(raw.plan_limit_bytes ?? PLAN_FREE_STORAGE_BYTES),
    totalBytes: Number(raw.total_bytes ?? 0),
    usedPercent: Number(raw.used_percent ?? 0),
    freeBytes: Number(raw.free_bytes ?? 0),
    buckets: buckets.map((b) => ({
      bucketId: String(b.bucket_id ?? ''),
      totalObjects: Number(b.total_objects ?? 0),
      totalBytes: Number(b.total_bytes ?? 0),
      usedPercent: Number(b.used_percent ?? 0),
    })),
  };
}

// ──────────────────────────────────────────────
// Storage API
// ──────────────────────────────────────────────

export async function getStorageDashboard(): Promise<{
  storage: StorageStats;
  overview: StorageOverview;
  heavyChats: HeavyChat[];
  rankingTotalCount: number;
  suggestions: StorageSuggestion[];
}> {
  const data = await invokeStorageMonitor<EdgeDashboardResponse>({ action: 'dashboard' });
  return {
    storage: data.storage,
    overview: mapOverview(data.overview as unknown as Record<string, unknown>),
    heavyChats: data.heavyChats,
    rankingTotalCount: data.rankingTotalCount,
    suggestions: data.suggestions ?? [],
  };
}

export async function getConversationRanking(params: {
  limit?: number;
  offset?: number;
  sort?: RankingSort;
}): Promise<{ rows: HeavyChat[]; totalCount: number }> {
  const data = await invokeStorageMonitor<{
    rows: HeavyChat[];
    totalCount: number;
  }>({
    action: 'ranking',
    limit: params.limit ?? 20,
    offset: params.offset ?? 0,
    sort: params.sort ?? 'bytes',
  });
  return { rows: data.rows, totalCount: data.totalCount };
}

export async function analyzeStorage(params?: { minAgeDays?: number }): Promise<{
  duplicateGroups: DuplicatePdfGroup[];
  orphans: StorageOrphans;
  preview: OptimizationPreview;
}> {
  return invokeStorageMonitor({
    action: 'analyze',
    minAgeDays: params?.minAgeDays ?? 14,
  });
}

export async function optimizeDuplicatePdfs(params: {
  dryRun?: boolean;
  confirmPhrase?: string;
  minAgeDays?: number;
}) {
  return invokeStorageMonitor({
    action: 'optimize_duplicate_pdfs',
    dryRun: params.dryRun ?? true,
    confirmPhrase: params.confirmPhrase,
    minAgeDays: params.minAgeDays ?? 14,
  });
}

export async function optimizeStaleCatalogPdfs(params: {
  dryRun?: boolean;
  confirmPhrase?: string;
  minAgeDays?: number;
}) {
  return invokeStorageMonitor({
    action: 'optimize_stale_catalog_pdfs',
    dryRun: params.dryRun ?? true,
    confirmPhrase: params.confirmPhrase,
    minAgeDays: params.minAgeDays ?? 30,
  });
}

export async function deleteConversationMedia(params: {
  stableKey: string;
  dryRun?: boolean;
  confirmPhrase?: string;
}) {
  return invokeStorageMonitor({
    action: 'delete_conversation_media',
    stableKey: params.stableKey,
    dryRun: params.dryRun ?? true,
    confirmPhrase: params.confirmPhrase,
  });
}

export async function backfillMediaMetadata(params?: { dryRun?: boolean; includeSha256?: boolean }) {
  return invokeStorageMonitor({
    action: 'backfill_metadata',
    dryRun: params?.dryRun ?? true,
    includeSha256: params?.includeSha256 ?? true,
  });
}

// Legacy helpers (mantener compatibilidad con imports existentes)
export async function getStorageStats(): Promise<StorageStats> {
  const { storage } = await getStorageDashboard();
  return storage;
}

export async function getHeavyChats(limit = 20): Promise<HeavyChat[]> {
  const { rows } = await getConversationRanking({ limit, offset: 0, sort: 'bytes' });
  return rows;
}

// ──────────────────────────────────────────────
// Métricas generales
// ──────────────────────────────────────────────

async function safeCount(table: string, filter?: { column: string; value: unknown }): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from(table as any) as any).select('*', { count: 'exact', head: true });
    if (filter) {
      query = query.eq(filter.column, filter.value);
    }
    const { count, error } = await query;
    if (error) {
      console.warn(`safeCount(${table}):`, error.message);
      return 0;
    }
    return count ?? 0;
  } catch (e) {
    console.warn(`safeCount(${table}): exception`, e);
    return 0;
  }
}

export async function getGeneralMetrics(): Promise<GeneralMetrics> {
  const [
    conversations,
    messages,
    leads,
    mediaAssets,
    clients,
    appointments,
    activeConv,
    blocklisted,
    broadcastJobs,
    tags,
    adminProfiles,
  ] = await Promise.all([
    safeCount('whatsapp_conversations'),
    safeCount('whatsapp_message_log'),
    safeCount('crm_directory'),
    safeCount('whatsapp_media_assets'),
    safeCount('crm_clients'),
    safeCount('crm_appointments'),
    safeCount('whatsapp_conversations', { column: 'is_archived', value: false }),
    safeCount('whatsapp_blocklist'),
    safeCount('whatsapp_broadcast_jobs'),
    safeCount('whatsapp_chat_tags'),
    safeCount('admin_profiles'),
  ]);

  return {
    conversations,
    messages,
    leads,
    mediaAssets,
    clients,
    appointments,
    activeConversations: activeConv,
    blocklisted,
    broadcastJobs,
    tags,
    adminProfiles,
  };
}

// ──────────────────────────────────────────────
// Conexiones
// ──────────────────────────────────────────────

export async function checkConnections(): Promise<ConnectionStatus> {
  const result: ConnectionStatus = {
    supabase: { status: 'checking' },
    firebase: { status: 'checking' },
    whatsappApi: { status: 'checking' },
  };

  const supabaseStart = performance.now();
  try {
    const { error } = await supabase.from('admin_profiles').select('id', { count: 'exact', head: true }).limit(1);
    if (error) throw error;
    result.supabase = {
      status: 'ok',
      latency: Math.round(performance.now() - supabaseStart),
    };
  } catch (e) {
    result.supabase = {
      status: 'error',
      error: e instanceof Error ? e.message : 'Error conectando a Supabase',
    };
  }

  try {
    const app = getApp();
    if (app?.options.projectId) {
      result.firebase = { status: 'ok' };
    } else {
      result.firebase = { status: 'error', error: 'Firebase SDK no inicializado' };
    }
  } catch (e) {
    result.firebase = {
      status: 'error',
      error: e instanceof Error ? e.message : 'Firebase no disponible',
    };
  }

  try {
    const { WHATSAPP_CLOUD_PRODUCTION } = await import('@/constants/whatsappCloudAccounts');
    if (WHATSAPP_CLOUD_PRODUCTION?.phoneNumberId && WHATSAPP_CLOUD_PRODUCTION?.wabaId) {
      result.whatsappApi = {
        status: 'ok',
        phoneNumberId: WHATSAPP_CLOUD_PRODUCTION.phoneNumberId,
      };
    } else {
      result.whatsappApi = { status: 'error', error: 'WhatsApp Cloud no configurado' };
    }
  } catch {
    result.whatsappApi = { status: 'error', error: 'No se pudo verificar WhatsApp API' };
  }

  return result;
}

// ──────────────────────────────────────────────
// Dashboard completo
// ──────────────────────────────────────────────

export async function getMonitorDashboard(): Promise<MonitorDashboard> {
  const [storageData, metrics, connections] = await Promise.allSettled([
    getStorageDashboard().catch((e) => {
      console.error('Error en storage dashboard:', e);
      return null;
    }),
    getGeneralMetrics().catch((e) => {
      console.error('Error en general metrics:', e);
      return null;
    }),
    checkConnections(),
  ]);

  const storagePayload = storageData.status === 'fulfilled' ? storageData.value : null;

  return {
    storage: storagePayload?.storage ?? null,
    overview: storagePayload?.overview ?? null,
    heavyChats: storagePayload?.heavyChats ?? [],
    rankingTotalCount: storagePayload?.rankingTotalCount ?? 0,
    suggestions: storagePayload?.suggestions ?? [],
    metrics: metrics.status === 'fulfilled' ? metrics.value : null,
    connections: connections.status === 'fulfilled' ? connections.value : {
      supabase: { status: 'error', error: 'Falló verificación de conexiones' },
      firebase: { status: 'error', error: 'Falló verificación de conexiones' },
      whatsappApi: { status: 'error', error: 'Falló verificación de conexiones' },
    },
  };
}
