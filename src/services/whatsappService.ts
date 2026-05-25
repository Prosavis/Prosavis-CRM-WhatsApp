import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/config/supabase';
import type { Database } from '@/types/database';
import type {
  MessageLogFilters,
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppMetrics,
  WhatsAppTag,
} from '@/types/whatsapp';

type ConversationRow = Database['public']['Tables']['whatsapp_conversations']['Row'];
type MessageRow = Database['public']['Tables']['whatsapp_message_log']['Row'];
type TagRow = Database['public']['Tables']['whatsapp_chat_tags']['Row'];

type Unsubscribe = () => void;

const DEFAULT_MESSAGE_LIMIT = 200;

function toDate(value: string | null | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function mapConversation(row: ConversationRow): WhatsAppConversation {
  return {
    id: row.id,
    stableKey: row.stable_key,
    phone: row.phone ?? undefined,
    bsuid: row.bsuid ?? undefined,
    state: row.state,
    lastMessageText: row.last_message_text ?? undefined,
    lastMessageAt: toDate(row.last_message_at),
    lastMessageDirection: row.last_message_direction ?? undefined,
    lastMessageOutboundStatus: row.last_message_outbound_status ?? undefined,
    unreadCount: row.unread_count,
    contactName: row.contact_name ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    contactPhotoUrl: row.contact_photo_url ?? undefined,
    whatsappProfileName: row.whatsapp_profile_name ?? undefined,
    adminNotes: row.admin_notes ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    phoneNumberId: row.phone_number_id ?? undefined,
    automatedInboundDisabled: row.automated_inbound_disabled,
    tagIds: row.tag_ids ?? [],
    isArchived: row.is_archived,
    archivedAt: toDate(row.archived_at),
    isPinned: row.is_pinned,
    pinnedAt: toDate(row.pinned_at),
    crmForceUnread: row.crm_force_unread,
  };
}

function mapMessage(row: MessageRow): WhatsAppMessage {
  return {
    id: row.id,
    conversationStableKey: row.conversation_stable_key,
    recipientPhone: row.recipient_phone ?? undefined,
    recipientBsuid: row.recipient_bsuid ?? undefined,
    direction: row.direction,
    senderType: row.sender_type,
    agentUid: row.agent_uid ?? undefined,
    messageBody: row.message_body ?? undefined,
    mediaType: row.media_type ?? undefined,
    mediaUrl: row.media_url ?? undefined,
    storageUrl: row.storage_url ?? undefined,
    caption: row.caption ?? undefined,
    status: row.status,
    waMessageId: row.wa_message_id ?? undefined,
    intent: row.intent ?? undefined,
    templateName: row.template_name ?? undefined,
    campaignType: row.campaign_type ?? undefined,
    phoneNumberId: row.phone_number_id ?? undefined,
    createdAt: new Date(row.created_at),
  };
}

function mapTag(row: TagRow): WhatsAppTag {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    createdAt: toDate(row.created_at),
    createdBy: row.created_by ?? undefined,
    archived: row.archived,
  };
}

async function fetchConversations(phoneNumberId?: string): Promise<WhatsAppConversation[]> {
  let query = supabase
    .from('whatsapp_conversations')
    .select('*')
    .eq('is_archived', false)
    .order('is_pinned', { ascending: false })
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (phoneNumberId) {
    query = query.eq('phone_number_id', phoneNumberId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapConversation);
}

export function subscribeToConversations(
  callback: (conversations: WhatsAppConversation[]) => void,
  phoneNumberId?: string,
  onError?: (error: Error) => void,
): Unsubscribe {
  let channel: RealtimeChannel | null = null;

  const load = async () => {
    try {
      callback(await fetchConversations(phoneNumberId));
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  void load();
  channel = supabase
    .channel(`whatsapp-conversations:${phoneNumberId ?? 'all'}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'whatsapp_conversations',
      },
      () => void load(),
    )
    .subscribe();

  return () => {
    if (channel) void supabase.removeChannel(channel);
  };
}

async function fetchMessages(stableKey: string): Promise<WhatsAppMessage[]> {
  const { data, error } = await supabase
    .from('whatsapp_message_log')
    .select('*')
    .eq('conversation_stable_key', stableKey)
    .eq('hidden_from_panel', false)
    .order('created_at', { ascending: true })
    .limit(DEFAULT_MESSAGE_LIMIT);

  if (error) throw error;
  return (data ?? []).map(mapMessage);
}

export function subscribeToMessages(
  stableKey: string,
  callback: (messages: WhatsAppMessage[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let channel: RealtimeChannel | null = null;

  const load = async () => {
    try {
      callback(await fetchMessages(stableKey));
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  void load();
  channel = supabase
    .channel(`whatsapp-messages:${stableKey}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'whatsapp_message_log',
        filter: `conversation_stable_key=eq.${stableKey}`,
      },
      () => void load(),
    )
    .subscribe();

  return () => {
    if (channel) void supabase.removeChannel(channel);
  };
}

export async function sendWhatsAppChatMessage(params: {
  conversationStableKey: string;
  messageBody: string;
  recipientPhone?: string;
  phoneNumberId?: string;
}): Promise<WhatsAppMessage> {
  const { data, error } = await supabase.functions.invoke<MessageRow>(
    'send-whatsapp-chat-message',
    { body: params },
  );

  if (error) throw error;
  if (!data) throw new Error('La funcion no devolvio mensaje.');
  return mapMessage(data);
}

export async function markWhatsAppAsRead(stableKey: string): Promise<void> {
  const { error } = await supabase.functions.invoke('mark-whatsapp-as-read', {
    body: { stableKey },
  });

  if (error) throw error;
}

export async function patchWhatsAppConversationAdmin(
  stableKey: string,
  patch: Partial<Pick<WhatsAppConversation, 'adminNotes' | 'tagIds' | 'isPinned' | 'isArchived' | 'automatedInboundDisabled'>>,
): Promise<void> {
  const { error } = await supabase.functions.invoke('patch-whatsapp-conversation', {
    body: { stableKey, patch },
  });

  if (error) throw error;
}

export async function listWhatsAppMessageLog(
  filters: MessageLogFilters = {},
): Promise<WhatsAppMessage[]> {
  const { data, error } = await supabase.functions.invoke<MessageRow[]>(
    'list-whatsapp-message-log',
    { body: filters },
  );

  if (error) throw error;
  return (data ?? []).map(mapMessage);
}

export async function getWhatsAppMetrics(days = 30): Promise<WhatsAppMetrics> {
  const { data, error } = await supabase.functions.invoke<WhatsAppMetrics>(
    'get-whatsapp-metrics',
    { body: { days } },
  );

  if (error) throw error;
  if (!data) throw new Error('La funcion no devolvio metricas.');
  return data;
}

export async function listWhatsAppTags(): Promise<WhatsAppTag[]> {
  const { data, error } = await supabase
    .from('whatsapp_chat_tags')
    .select('*')
    .eq('archived', false)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(mapTag);
}

export async function createWhatsAppTag(params: {
  name: string;
  color: string;
}): Promise<WhatsAppTag> {
  const { data, error } = await supabase
    .from('whatsapp_chat_tags')
    .insert({ name: params.name, color: params.color })
    .select('*')
    .single();

  if (error) throw error;
  return mapTag(data);
}

export async function assignWhatsAppTags(
  stableKey: string,
  tagIds: string[],
): Promise<void> {
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({ tag_ids: tagIds })
    .eq('stable_key', stableKey);

  if (error) throw error;
}

export async function getWhatsAppAutomationSetting(): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke<{ enabled: boolean }>(
    'get-whatsapp-automation-setting',
  );

  if (error) throw error;
  return data?.enabled ?? false;
}

export async function setWhatsAppAutomationSetting(enabled: boolean): Promise<void> {
  const { error } = await supabase.functions.invoke('set-whatsapp-automation-setting', {
    body: { enabled },
  });

  if (error) throw error;
}
