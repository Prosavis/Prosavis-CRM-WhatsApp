import { supabase } from '@/config/supabase';
import { getApp } from 'firebase/app';

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

export interface HeavyChat {
  stableKey: string;
  contactName: string | null;
  contactPhone: string | null;
  messageCount: number;
  mediaCount: number;
  totalBytes: number;
  lastMessageAt: string | null;
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
  heavyChats: HeavyChat[];
  metrics: GeneralMetrics | null;
  connections: ConnectionStatus;
}

// ──────────────────────────────────────────────
// Storage: desglose multimedia via RPC (storage.objects directo)
// ──────────────────────────────────────────────

const BUCKET_LIMIT = 5 * 1024 * 1024 * 1024; // 5 GB
const TEXT_MSG_ESTIMATE_BYTES = 2048; // ~2KB por mensaje de texto

function emptyBreakdown(): MediaBreakdown {
  return { image: { count: 0, bytes: 0 }, video: { count: 0, bytes: 0 }, audio: { count: 0, bytes: 0 }, document: { count: 0, bytes: 0 }, text: { count: 0, bytes: 0 }, other: { count: 0, bytes: 0 } };
}

export async function getStorageStats(): Promise<StorageStats> {
  // 1. Stats reales desde storage.objects vía RPC (rápido, preciso)
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_storage_stats', {
    p_bucket: 'whatsapp-media',
  });

  if (rpcError) throw rpcError;

  const json = rpcData as unknown as {
    total_objects: number;
    total_bytes: number;
    breakdown: Record<string, { count: number; bytes: number }>;
  };

  const storageTotalObjects = json.total_objects ?? 0;
  const storageTotalBytes = json.total_bytes ?? 0;

  // Mapear breakdown del RPC al tipo MediaBreakdown
  const breakdown = emptyBreakdown();
  if (json.breakdown) {
    const bd = breakdown as unknown as Record<string, { count: number; bytes: number }>;
    for (const [key, val] of Object.entries(json.breakdown)) {
      if (key in bd) {
        bd[key] = { count: val.count ?? 0, bytes: val.bytes ?? 0 };
      }
    }
  }

  // 2. Texto plano: mensajes sin storage_path se estiman a 2KB c/u
  const { count: textOnlyMessages } = await supabase
    .from('whatsapp_message_log')
    .select('*', { count: 'exact', head: true })
    .is('storage_path', null);

  const textCount = textOnlyMessages ?? 0;
  const textBytes = textCount * TEXT_MSG_ESTIMATE_BYTES;
  breakdown.text.count = textCount;
  breakdown.text.bytes = textBytes;

  const totalBytes = storageTotalBytes + textBytes;

  return {
    totalObjects: storageTotalObjects,
    totalBytes,
    bucketLimit: BUCKET_LIMIT,
    usedPercent: Math.min(100, +(totalBytes / BUCKET_LIMIT * 100).toFixed(1)),
    freeBytes: BUCKET_LIMIT - totalBytes,
    freePercent: Math.min(100, +((BUCKET_LIMIT - totalBytes) / BUCKET_LIMIT * 100).toFixed(1)),
    breakdown,
  };
}

// ──────────────────────────────────────────────
// Chats pesados
// ──────────────────────────────────────────────

export async function getHeavyChats(limit = 20): Promise<HeavyChat[]> {
  // 1. Obtener las conversaciones más recientes
  const { data: conversations, error } = await supabase
    .from('whatsapp_conversations')
    .select('stable_key, contact_name, contact_phone, last_message_at')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) throw error;
  if (!conversations || conversations.length === 0) return [];

  const stableKeys = conversations.map((c) => c.stable_key);

  // 2. BATCH: obtener conteo de mensajes por conversación en UNA SOLA QUERY
  const { data: allMessages } = await supabase
    .from('whatsapp_message_log')
    .select('conversation_stable_key')
    .in('conversation_stable_key', stableKeys);

  const msgCountMap = new Map<string, number>();
  if (allMessages) {
    for (const msg of allMessages) {
      const key = msg.conversation_stable_key;
      msgCountMap.set(key, (msgCountMap.get(key) ?? 0) + 1);
    }
  }

  // 3. BATCH: obtener assets multimedia por conversación en UNA SOLA QUERY
  const { data: allMedia } = await supabase
    .from('whatsapp_media_assets')
    .select('conversation_stable_key, size_bytes')
    .in('conversation_stable_key', stableKeys);

  const mediaByConv = new Map<string, { count: number; bytes: number }>();
  if (allMedia) {
    for (const m of allMedia) {
      const key = m.conversation_stable_key;
      const prev = mediaByConv.get(key) ?? { count: 0, bytes: 0 };
      prev.count += 1;
      prev.bytes += m.size_bytes ?? 0;
      mediaByConv.set(key, prev);
    }
  }

  // 4. Ensamblar resultados
  const chats: HeavyChat[] = conversations.map((conv) => {
    const media = mediaByConv.get(conv.stable_key) ?? { count: 0, bytes: 0 };
    return {
      stableKey: conv.stable_key,
      contactName: conv.contact_name,
      contactPhone: conv.contact_phone,
      messageCount: msgCountMap.get(conv.stable_key) ?? 0,
      mediaCount: media.count,
      totalBytes: media.bytes,
      lastMessageAt: conv.last_message_at,
    };
  });

  // Ordenar por peso total descendente (más pesados primero) y limitar
  return chats.sort((a, b) => b.totalBytes - a.totalBytes).slice(0, limit);
}

// ──────────────────────────────────────────────
// Métricas generales
// ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeCount(table: string, filter?: { column: string; value: any }): Promise<number> {
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

  // Supabase: query simple
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

  // Firebase: verificar que el SDK esté inicializado
  try {
    const app = getApp();
    if (app && app.options.projectId) {
      result.firebase = {
        status: 'ok',
      };
    } else {
      result.firebase = { status: 'error', error: 'Firebase SDK no inicializado' };
    }
  } catch (e) {
    result.firebase = {
      status: 'error',
      error: e instanceof Error ? e.message : 'Firebase no disponible',
    };
  }

  // WhatsApp API: verificar que tengamos configurada la línea
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
  const [storage, heavyChats, metrics, connections] = await Promise.allSettled([
    getStorageStats().catch((e) => {
      console.error('Error en storage stats:', e);
      return null;
    }),
    getHeavyChats().catch((e) => {
      console.error('Error en heavy chats:', e);
      return [] as HeavyChat[];
    }),
    getGeneralMetrics().catch((e) => {
      console.error('Error en general metrics:', e);
      return null;
    }),
    checkConnections(),
  ]);

  return {
    storage: storage.status === 'fulfilled' ? storage.value : null,
    heavyChats: heavyChats.status === 'fulfilled' ? heavyChats.value : [],
    metrics: metrics.status === 'fulfilled' ? metrics.value : null,
    connections: connections.status === 'fulfilled' ? connections.value : {
      supabase: { status: 'error', error: 'Falló verificación de conexiones' },
      firebase: { status: 'error', error: 'Falló verificación de conexiones' },
      whatsappApi: { status: 'error', error: 'Falló verificación de conexiones' },
    },
  };
}
