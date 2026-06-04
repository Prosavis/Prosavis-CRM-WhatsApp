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
// Storage: desglose multimedia desde storage.objects
// ──────────────────────────────────────────────

const BUCKET_LIMIT = 5 * 1024 * 1024 * 1024; // 5 GB

function classifyMime(mime: string | null): keyof MediaBreakdown {
  if (!mime) return 'other';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('application/')) return 'document';
  if (mime === 'text/plain') return 'text';
  return 'other';
}

function emptyBreakdown(): MediaBreakdown {
  return { image: { count: 0, bytes: 0 }, video: { count: 0, bytes: 0 }, audio: { count: 0, bytes: 0 }, document: { count: 0, bytes: 0 }, text: { count: 0, bytes: 0 }, other: { count: 0, bytes: 0 } };
}

async function listAllStorageObjects(bucket: string, maxFiles = 2000): Promise<{ name: string; size: number; mimeType: string | null }[]> {
  const all: { name: string; size: number; mimeType: string | null }[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list('', {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const item of data) {
      if (item.metadata && typeof item.metadata === 'object') {
        const meta = item.metadata as Record<string, unknown>;
        const size = typeof meta.size === 'number' ? meta.size : 0;
        const mimeType = typeof meta.mimetype === 'string' ? meta.mimetype : null;
        all.push({ name: item.name, size, mimeType });
      }
    }
    offset += data.length;
    if (data.length < limit || all.length >= maxFiles) break;
  }
  return all;
}

export async function getStorageStats(): Promise<StorageStats> {
  const files = await listAllStorageObjects('whatsapp-media');
  const breakdown = emptyBreakdown();
  let totalBytes = 0;

  for (const f of files) {
    const key = classifyMime(f.mimeType);
    breakdown[key].count += 1;
    breakdown[key].bytes += f.size;
    totalBytes += f.size;
  }

  // Las conversaciones de solo texto no tienen archivos en storage,
  // pero calculamos un estimado: sumamos 2KB por cada mensaje sin multimedia
  // desde la tabla de mensajes
  const { count: textOnlyMessages } = await supabase
    .from('whatsapp_message_log')
    .select('*', { count: 'exact', head: true })
    .is('storage_path', null);

  const textBytes = (textOnlyMessages ?? 0) * 2048; // ~2KB por mensaje de texto
  breakdown.text.count = textOnlyMessages ?? 0;
  breakdown.text.bytes = textBytes;
  totalBytes += textBytes;

  return {
    totalObjects: files.length,
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
  // Obtenemos conversaciones con conteo de mensajes y multimedia
  const { data, error } = await supabase
    .from('whatsapp_conversations')
    .select(`
      stable_key,
      contact_name,
      contact_phone,
      last_message_at
    `)
    .order('last_message_at', { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const chats: HeavyChat[] = [];

  for (const conv of data) {
    // Mensajes en esta conversación
    const { count: msgCount, error: msgErr } = await supabase
      .from('whatsapp_message_log')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_stable_key', conv.stable_key);

    if (msgErr) continue;

    // Assets multimedia asociados a mensajes de esta conversación
    // Sumamos size_bytes desde whatsapp_media_assets vinculado vía message_log
    const { data: mediaData } = await supabase
      .from('whatsapp_media_assets')
      .select('size_bytes, mime_type')
      .eq('conversation_stable_key', conv.stable_key);

    const mediaCount = mediaData?.length ?? 0;
    const totalBytes = mediaData?.reduce((sum, m) => sum + (m.size_bytes ?? 0), 0) ?? 0;

    chats.push({
      stableKey: conv.stable_key,
      contactName: conv.contact_name,
      contactPhone: conv.contact_phone,
      messageCount: msgCount ?? 0,
      mediaCount,
      totalBytes,
      lastMessageAt: conv.last_message_at,
    });
  }

  // Ordenar por peso total descendente y tomar top N
  return chats.sort((a, b) => b.totalBytes - a.totalBytes).slice(0, limit);
}

// ──────────────────────────────────────────────
// Métricas generales
// ──────────────────────────────────────────────

export async function getGeneralMetrics(): Promise<GeneralMetrics> {
  const [
    { count: conversations },
    { count: messages },
    { count: leads },
    { count: mediaAssets },
    { count: clients },
    { count: appointments },
    { count: activeConv },
    { count: blocklisted },
    { count: broadcastJobs },
    { count: tags },
    { count: adminProfiles },
  ] = await Promise.all([
    supabase.from('whatsapp_conversations').select('*', { count: 'exact', head: true }),
    supabase.from('whatsapp_message_log').select('*', { count: 'exact', head: true }),
    supabase.from('crm_leads').select('*', { count: 'exact', head: true }),
    supabase.from('whatsapp_media_assets').select('*', { count: 'exact', head: true }),
    supabase.from('crm_clients').select('*', { count: 'exact', head: true }),
    supabase.from('crm_appointments').select('*', { count: 'exact', head: true }),
    supabase.from('whatsapp_conversations').select('*', { count: 'exact', head: true }).eq('is_archived', false),
    supabase.from('whatsapp_blocklist').select('*', { count: 'exact', head: true }),
    supabase.from('whatsapp_broadcast_jobs').select('*', { count: 'exact', head: true }),
    supabase.from('whatsapp_chat_tags').select('*', { count: 'exact', head: true }),
    supabase.from('admin_profiles').select('*', { count: 'exact', head: true }),
  ]);

  return {
    conversations: conversations ?? 0,
    messages: messages ?? 0,
    leads: leads ?? 0,
    mediaAssets: mediaAssets ?? 0,
    clients: clients ?? 0,
    appointments: appointments ?? 0,
    activeConversations: activeConv ?? 0,
    blocklisted: blocklisted ?? 0,
    broadcastJobs: broadcastJobs ?? 0,
    tags: tags ?? 0,
    adminProfiles: adminProfiles ?? 0,
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
