import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/config/supabase';
import type { Database } from '@/types/database';

type ConversationRow = Database['public']['Tables']['whatsapp_conversations']['Row'];
type MessageRow = Database['public']['Tables']['whatsapp_message_log']['Row'];
type TagRow = Database['public']['Tables']['whatsapp_chat_tags']['Row'];
type PresenceRow = Database['public']['Tables']['whatsapp_admin_presence']['Row'];

type Unsubscribe = () => void;

const DEFAULT_MESSAGE_LIMIT = 200;

async function invokeFn<T>(name: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    const ctx = error as { context?: Response };
    const response = ctx.context;
    if (response) {
      try {
        const payload = await response.json();
        const message =
          typeof payload === 'object' && payload && 'error' in payload
            ? String((payload as { error: unknown }).error)
            : JSON.stringify(payload);
        throw new Error(message || error.message);
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message !== error.message) {
          throw parseError;
        }
      }
    }
    throw error;
  }
  if (data === null || data === undefined) {
    throw new Error(`La funcion ${name} no devolvio datos.`);
  }
  return data;
}

function toDate(value: string | null | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function mapConversationRow(row: ConversationRow): WhatsAppConversation {
  return {
    id: row.stable_key,
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
    lastIntent: row.last_intent ?? undefined,
    userId: row.user_id ?? undefined,
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

function mapMessageRow(row: MessageRow): WhatsAppMessage {
  const location = row.location as WhatsAppLocation | null | undefined;
  const contacts = row.contacts as WhatsAppContact[] | null | undefined;
  return {
    id: row.id,
    recipientPhone: row.recipient_phone ?? undefined,
    recipientBsuid: row.recipient_bsuid ?? undefined,
    direction: row.direction,
    senderType: row.sender_type,
    agentUid: row.agent_uid ?? undefined,
    messageBody: row.message_body ?? undefined,
    mediaType: row.media_type ?? undefined,
    mediaId: row.media_id ?? undefined,
    mediaUrl: row.media_url ?? undefined,
    storageUrl: row.storage_url ?? undefined,
    caption: row.caption ?? undefined,
    status: row.status,
    errorMessage: row.error_message ?? undefined,
    waMessageId: row.wa_message_id ?? undefined,
    intent: row.intent ?? undefined,
    templateName: row.template_name ?? undefined,
    phoneNumberId: row.phone_number_id ?? undefined,
    campaignType: row.campaign_type ?? undefined,
    isVoiceNote: row.is_voice_note ?? undefined,
    location: location ?? undefined,
    contacts: contacts ?? undefined,
    reactionTo: row.reaction_to ?? undefined,
    reactionRemoved: row.reaction_removed ?? undefined,
    clientRequestId: row.client_request_id ?? undefined,
    replyToWaMessageId: row.reply_to_wa_message_id ?? undefined,
    filename: row.filename ?? undefined,
    batchId: row.batch_id ?? undefined,
    batchIndex: row.batch_index ?? undefined,
    clientAttachmentId: row.client_attachment_id ?? undefined,
    storagePath: row.storage_path ?? undefined,
    mimeType: row.mime_type ?? undefined,
    sizeBytes: row.size_bytes ?? undefined,
    voiceTranscription: row.voice_transcription ?? undefined,
    voiceTranscriptionAt: toDate(row.voice_transcription_at),
    voiceTranscriptionModel: row.voice_transcription_model ?? undefined,
    voiceTranscriptionMimeType: row.voice_transcription_mime_type ?? undefined,
    voiceTranscriptionBytes: row.voice_transcription_bytes ?? undefined,
    voiceTranscriptionStatus: row.voice_transcription_status as
      | 'completed'
      | 'failed'
      | undefined,
    voiceTranscriptionError: row.voice_transcription_error ?? undefined,
    voiceTranscriptionFailedAt: toDate(row.voice_transcription_failed_at),
    hiddenFromPanel: row.hidden_from_panel,
    revokedAt: toDate(row.revoked_at),
    revokedReason: row.revoked_reason as WhatsAppMessage['revokedReason'],
    createdAt: new Date(row.created_at),
  };
}

export interface WhatsAppConversation {
  id: string;
  phone?: string;
  bsuid?: string;
  state: 'active' | 'escalated' | 'resolved';
  lastMessageText?: string;
  lastMessageAt?: Date;
  lastMessageDirection?: 'inbound' | 'outbound';
  /** Estado del último saliente (Meta webhook `statuses`), solo si `lastMessageDirection === 'outbound'`. */
  lastMessageOutboundStatus?: 'sent' | 'delivered' | 'read' | 'failed' | string;
  unreadCount: number;
  contactName?: string;
  contactPhone?: string;
  contactPhotoUrl?: string;
  whatsappProfileName?: string;
  adminNotes?: string;
  assignedTo?: string;
  lastIntent?: string;
  userId?: string;
  phoneNumberId?: string;
  automatedInboundDisabled?: boolean;
  tagIds?: string[];
  isArchived?: boolean;
  archivedAt?: Date;
  isPinned?: boolean;
  pinnedAt?: Date;
  crmForceUnread?: boolean;
}

export interface WhatsAppLocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface WhatsAppContact {
  name?: { formatted_name?: string; first_name?: string; last_name?: string };
  phones?: Array<{ phone?: string; type?: string }>;
  org?: { company?: string };
}

export interface WhatsAppMessage {
  id: string;
  recipientPhone?: string;
  recipientBsuid?: string;
  direction: 'inbound' | 'outbound';
  senderType: 'bot' | 'agent' | 'system' | 'user';
  agentUid?: string;
  messageBody?: string;
  mediaType?: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  mediaId?: string;
  mediaUrl?: string;
  storageUrl?: string;
  caption?: string;
  status: string;
  errorMessage?: string;
  waMessageId?: string;
  intent?: string;
  templateName?: string;
  phoneNumberId?: string;
  campaignType?: string;
  isVoiceNote?: boolean;
  location?: WhatsAppLocation;
  contacts?: WhatsAppContact[];
  reactionTo?: string;
  reactionRemoved?: boolean;
  clientRequestId?: string;
  replyToWaMessageId?: string;
  filename?: string;
  batchId?: string;
  batchIndex?: number;
  clientAttachmentId?: string;
  storagePath?: string;
  mimeType?: string;
  sizeBytes?: number;
  voiceTranscription?: string;
  voiceTranscriptionAt?: Date;
  voiceTranscriptionModel?: string;
  voiceTranscriptionMimeType?: string;
  voiceTranscriptionBytes?: number;
  voiceTranscriptionStatus?: 'completed' | 'failed';
  voiceTranscriptionError?: string;
  voiceTranscriptionFailedAt?: Date;
  hiddenFromPanel?: boolean;
  revokedAt?: Date;
  revokedReason?: 'user_revoke' | 'crm';
  createdAt: Date;
}

export interface WhatsAppTag {
  id: string;
  name: string;
  color?: string;
  createdAt?: Date;
  createdBy?: string;
  archived?: boolean;
}

export interface WhatsAppSticker {
  id: string;
  name: string;
  storagePath: string;
  downloadUrl: string;
  mimeType: 'image/webp';
  sizeBytes: number;
  isAnimated?: boolean;
  createdAt?: Date;
  createdByUid?: string;
  updatedAt?: Date;
  archived?: boolean;
  favoriteByUids?: string[];
}

/**
 * Mismo `waMessageId` en Meta puede generar dos filas en Firestore (webhook con media + fila solo texto
 * desde handleInbound). Se oculta la copia sin `mediaType` si ya hay una con adjunto.
 */
function dedupeWhatsAppMessagesByWaMessageId(
  messages: WhatsAppMessage[],
): WhatsAppMessage[] {
  const byWa = new Map<string, WhatsAppMessage[]>();
  for (const m of messages) {
    const wid = (m.waMessageId || '').trim();
    if (!wid || m.direction !== 'inbound') continue;
    const arr = byWa.get(wid) || [];
    arr.push(m);
    byWa.set(wid, arr);
  }
  const dropIds = new Set<string>();
  for (const [, group] of byWa) {
    if (group.length < 2) continue;
    const withMedia = group.some((g) => !!g.mediaType);
    if (!withMedia) continue;
    for (const g of group) {
      if (!g.mediaType) dropIds.add(g.id);
    }
  }
  return messages.filter((m) => !dropIds.has(m.id));
}

async function fetchConversations(phoneNumberId?: string): Promise<WhatsAppConversation[]> {
  let query = supabase
    .from('whatsapp_conversations')
    .select('*')
    .order('is_pinned', { ascending: false })
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (phoneNumberId) {
    query = query.eq('phone_number_id', phoneNumberId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapConversationRow);
}

export async function refetchConversations(
  phoneNumberId?: string,
): Promise<WhatsAppConversation[]> {
  return fetchConversations(phoneNumberId);
}

export function subscribeToConversations(
  callback: (conversations: WhatsAppConversation[]) => void,
  phoneNumberId?: string,
  onError?: (error: Error) => void,
): Unsubscribe {
  let disposed = false;
  let channel: RealtimeChannel | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const load = async () => {
    if (disposed) return;
    try {
      callback(await fetchConversations(phoneNumberId));
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const scheduleRetry = () => {
    if (disposed || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void load();
    }, 2000);
  };

  void load();
  channel = supabase
    .channel(`whatsapp-conversations:${phoneNumberId ?? 'all'}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'whatsapp_conversations' },
      () => void load(),
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        scheduleRetry();
      }
    });

  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (channel) void supabase.removeChannel(channel);
  };
}

/** Números únicos (solo dígitos, 10–15) de conversaciones de la línea, para envío masivo. */
export async function fetchConversationPhoneNumbersForBulk(
  phoneNumberId: string,
): Promise<string[]> {
  const conversations = await fetchConversations(phoneNumberId);
  const set = new Set<string>();
  for (const c of conversations) {
    for (const raw of [c.phone, c.contactPhone]) {
      if (!raw) continue;
      const digits = raw.replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 15) set.add(digits);
    }
  }
  return [...set];
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
  return dedupeWhatsAppMessagesByWaMessageId((data ?? []).map(mapMessageRow));
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

export async function patchWhatsAppConversationAdmin(params: {
  conversationId: string;
  patch: Partial<{
    contactName: string | null;
    adminNotes: string | null;
    contactPhotoUrl: string | null;
    whatsappProfileName: string | null;
    automatedInboundDisabled: boolean | null;
    isArchived: boolean;
    isPinned: boolean;
    crmForceUnread: boolean;
  }>;
}): Promise<{ success: boolean }> {
  return invokeFn<{ success: boolean }>('patch-whatsapp-conversation', {
    conversationId: params.conversationId,
    patch: params.patch as Record<string, unknown>,
  });
}

export async function sendMessage(
  to: string,
  text: string,
  phoneNumberId?: string,
  replyToWaMessageId?: string,
) {
  const data = await invokeFn<{
    success: boolean;
    waMessageId?: string;
    error?: string;
  }>('send-whatsapp-chat-message', {
    to,
    text,
    ...(phoneNumberId ? { phoneNumberId } : {}),
    ...(replyToWaMessageId ? { replyToWaMessageId } : {}),
  });
  if (!data.success) {
    throw new Error(data.error ?? 'No se pudo enviar el mensaje por WhatsApp.');
  }
  return data;
}

export type WhatsAppOutboundMediaType = 'image' | 'audio' | 'video' | 'document' | 'sticker';

export async function sendMedia(
  to: string,
  mediaType: WhatsAppOutboundMediaType,
  mediaUrl: string,
  options?: {
    caption?: string;
    filename?: string;
    phoneNumberId?: string;
    replyToWaMessageId?: string;
    storagePath?: string;
    mimeType?: string;
    sizeBytes?: number;
    isAnimatedSticker?: boolean;
  },
) {
  const data = await invokeFn<{
    success: boolean;
    waMessageId?: string;
    error?: string;
  }>('send-whatsapp-chat-message', {
    to,
    mediaUrl,
    mediaType,
    ...(options?.caption ? { caption: options.caption } : {}),
    ...(options?.filename ? { filename: options.filename } : {}),
    ...(options?.phoneNumberId ? { phoneNumberId: options.phoneNumberId } : {}),
    ...(options?.replyToWaMessageId ? { replyToWaMessageId: options.replyToWaMessageId } : {}),
    ...(options?.storagePath ? { storagePath: options.storagePath } : {}),
    ...(options?.mimeType ? { mimeType: options.mimeType } : {}),
    ...(typeof options?.sizeBytes === 'number' ? { sizeBytes: options.sizeBytes } : {}),
    ...(typeof options?.isAnimatedSticker === 'boolean'
      ? { isAnimatedSticker: options.isAnimatedSticker }
      : {}),
  });
  if (!data.success) {
    throw new Error(data.error ?? 'No se pudo enviar el archivo por WhatsApp.');
  }
  return data;
}

export async function sendReaction(params: {
  to: string;
  reactToWaMessageId: string;
  emoji: string;
  phoneNumberId?: string;
  clientRequestId?: string;
}): Promise<{ success: boolean; waMessageId?: string; messageId?: string }> {
  const data = await invokeFn('send-whatsapp-reaction', {
    to: params.to,
    reactToWaMessageId: params.reactToWaMessageId,
    emoji: params.emoji,
    ...(params.phoneNumberId ? { phoneNumberId: params.phoneNumberId } : {}),
    ...(params.clientRequestId ? { clientRequestId: params.clientRequestId } : {}),
  });
  return data as { success: boolean; waMessageId?: string; messageId?: string };
}

export interface WhatsAppMediaBatchAttachment {
  clientAttachmentId: string;
  mediaType: Exclude<WhatsAppOutboundMediaType, 'sticker'>;
  mediaUrl: string;
  storagePath?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface WhatsAppMediaBatchResultItem {
  index: number;
  clientAttachmentId?: string;
  success: boolean;
  waMessageId?: string;
  logId?: string;
  error?: string;
}

export async function sendMediaBatch(params: {
  to: string;
  phoneNumberId?: string;
  caption?: string;
  replyToWaMessageId?: string;
  clientBatchId: string;
  attachments: WhatsAppMediaBatchAttachment[];
}): Promise<{
  success: boolean;
  batchId: string;
  status: 'completed' | 'partial_failed' | 'failed' | 'processing';
  sent: number;
  failed: number;
  results: WhatsAppMediaBatchResultItem[];
  reused?: boolean;
}> {
  const data = await invokeFn('send-whatsapp-media-batch', {
    to: params.to,
    clientBatchId: params.clientBatchId,
    attachments: params.attachments,
    ...(params.phoneNumberId ? { phoneNumberId: params.phoneNumberId } : {}),
    ...(params.caption ? { caption: params.caption } : {}),
    ...(params.replyToWaMessageId ? { replyToWaMessageId: params.replyToWaMessageId } : {}),
  });
  return data as {
    success: boolean;
    batchId: string;
    status: 'completed' | 'partial_failed' | 'failed' | 'processing';
    sent: number;
    failed: number;
    results: WhatsAppMediaBatchResultItem[];
    reused?: boolean;
  };
}

export async function transcribeWhatsAppInboundAudio(
  messageLogId: string,
  force = false,
): Promise<{ success: boolean; transcript: string; cached?: boolean }> {
  const data = await invokeFn('transcribe-whatsapp-inbound-audio', { messageLogId, ...(force ? { force } : {}) });
  return data as { success: boolean; transcript: string; cached?: boolean };
}

export async function markAsRead(
  waMessageId: string | undefined,
  conversationKey?: string,
  phoneNumberId?: string,
) {
  const payload: Record<string, unknown> = {};
  if (waMessageId) payload.waMessageId = waMessageId;
  if (conversationKey) payload.conversationKey = conversationKey;
  if (phoneNumberId) payload.phoneNumberId = phoneNumberId;
  const data = await invokeFn('mark-whatsapp-as-read', payload);
  return data as { success: boolean };
}

export function isMetaHostedMediaUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return /lookaside\.fbsbx\.com|fbcdn\.net/i.test(url);
}

export async function getMediaUrl(
  mediaId: string,
  options?: {
    storagePath?: string;
    mediaAssetId?: string;
    stableKeyHint?: string;
    mimeType?: string;
  },
) {
  if (options?.storagePath) {
    try {
      const signed = await getWhatsAppMediaSignedUrl({ storagePath: options.storagePath });
      return {
        url: signed,
        mimeType: options.mimeType ?? 'application/octet-stream',
        fileSize: 0,
      };
    } catch {
      // Continúa con la Edge Function (backfill / persistencia).
    }
  }

  const data = await invokeFn<{
    signedUrl?: string;
    storagePath?: string;
    mimeType: string;
    fileSize: number;
  }>('get-whatsapp-media-url', {
    mediaId,
    ...(options?.mediaAssetId ? { mediaAssetId: options.mediaAssetId } : {}),
    ...(options?.storagePath ? { storagePath: options.storagePath } : {}),
    ...(options?.stableKeyHint ? { stableKeyHint: options.stableKeyHint } : {}),
    ...(options?.mimeType ? { mimeType: options.mimeType } : {}),
  });

  if (data.signedUrl && !isMetaHostedMediaUrl(data.signedUrl)) {
    return { url: data.signedUrl, mimeType: data.mimeType, fileSize: data.fileSize };
  }
  if (data.storagePath) {
    const signed = await getWhatsAppMediaSignedUrl({ storagePath: data.storagePath });
    return { url: signed, mimeType: data.mimeType, fileSize: data.fileSize };
  }
  throw new Error('No se pudo resolver URL del medio.');
}

export interface WhatsAppTemplateSummary {
  name: string;
  language: string;
  status: string;
  /** UTILITY | MARKETING | AUTHENTICATION (Meta Cloud API) */
  category?: string;
  components: unknown[];
}

export async function listWhatsAppMessageTemplates(wabaId: string): Promise<WhatsAppTemplateSummary[]> {
  const data = await invokeFn<{ templates: WhatsAppTemplateSummary[] }>(
    'list-whatsapp-message-templates',
    { wabaId },
  );
  return data.templates ?? [];
}

export async function sendWhatsAppTemplateMessageAdmin(params: {
  recipientPhone: string;
  templateName: string;
  templateLanguage?: string;
  phoneNumberId?: string;
  displayMessageBody?: string;
  components?: Array<{
    type: 'header' | 'body' | 'button';
    parameters?: Array<{ type: 'text'; text?: string }>;
  }>;
}): Promise<{ success: boolean; waMessageId?: string }> {
  return invokeFn<{ success: boolean; waMessageId?: string }>(
    'send-whatsapp-template-message',
    params,
  );
}

export interface BookingContextData {
  stage: 'no_booking' | 'info_gathering' | 'availability' | 'summary_confirmation' | 'payment_pending' | 'payment_confirmed';
  collectedData: {
    date: string | null;
    time: string | null;
    duration: number | null;
    address: string | null;
    addressSource?: 'conversation' | 'lead' | null;
  };
  missingData: string[];
  availableSlots: string[];
  paymentStatus: 'APPROVED' | 'PENDING' | 'none';
  paymentAmount: number | null;
  calculatedPrice: number | null;
  clientInfo: {
    name: string | null;
    phone: string;
    email: string | null;
    address: string | null;
    city: string | null;
    isReturningClient: boolean;
    userId: string | null;
  };
}

export interface SuggestReplyResult {
  suggestion: string | null;
  lastMessageIsOutbound: boolean;
  hint?: string;
  bookingContext?: BookingContextData;
  wompiCheckoutUrl?: string;
  wompiPaymentReference?: string;
  wompiAmountCOP?: number;
}

export async function suggestWhatsAppAgentReply(
  stableKey: string,
  forceGenerate = false,
  includeVoiceTranscriptions = false,
  extraContext?: string,
): Promise<SuggestReplyResult> {
  const data = await invokeFn<SuggestReplyResult & {
    hint?: string;
    wompiCheckoutUrl?: string;
    wompiPaymentReference?: string;
    wompiAmountCOP?: number;
  }>('suggest-whatsapp-agent-reply', {
    stableKey,
    forceGenerate,
    includeVoiceTranscriptions,
    ...(extraContext?.trim() ? { extraContext: extraContext.trim() } : {}),
  });
  return {
    suggestion: data.suggestion ?? null,
    lastMessageIsOutbound: data.lastMessageIsOutbound ?? false,
    hint: data.hint,
    bookingContext: data.bookingContext,
    wompiCheckoutUrl: data.wompiCheckoutUrl,
    wompiPaymentReference: data.wompiPaymentReference,
    wompiAmountCOP: data.wompiAmountCOP,
  };
}

export interface BookingContextResult {
  bookingContext: BookingContextData | null;
  wompiCheckoutUrl?: string;
  wompiPaymentReference?: string;
  wompiAmountCOP?: number;
}

export async function getWhatsAppBookingContext(
  stableKey: string,
  includeVoiceTranscriptions = false,
): Promise<BookingContextResult> {
  const data = await invokeFn<BookingContextResult>('get-whatsapp-booking-context', {
    stableKey,
    includeVoiceTranscriptions,
  });
  return {
    bookingContext: data.bookingContext ?? null,
    wompiCheckoutUrl: data.wompiCheckoutUrl,
    wompiPaymentReference: data.wompiPaymentReference,
    wompiAmountCOP: data.wompiAmountCOP,
  };
}

export async function getProsavisCleaningWompiCheckoutUrl(amountCOP: number): Promise<{
  url: string;
  reference: string | null;
  amountInCents: number;
  amountCOP: number;
}> {
  return invokeFn<{
    url: string;
    reference: string | null;
    amountInCents: number;
    amountCOP: number;
  }>('get-prosavis-cleaning-wompi-checkout-url', { amountCOP });
}

export async function bulkWhatsAppSend(params: {
  recipients: Array<{ phone: string; name?: string }>;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: Array<{
    type: 'header' | 'body';
    parameters: Array<{ type: 'text'; text: string }>;
  }>;
  richBody?: string;
  phoneNumberId?: string;
  confirmation: string;
}): Promise<{ jobId: string; sent: number; failed: number; skipped: number }> {
  return invokeFn<{ jobId: string; sent: number; failed: number; skipped: number }>(
    'bulk-whatsapp-send',
    params,
  );
}

export async function ensureWhatsAppConversationFromLead(params: {
  phone: string;
  name?: string;
  phoneNumberId?: string;
}): Promise<{ success: boolean; conversationId: string }> {
  return invokeFn<{ success: boolean; conversationId: string }>(
    'ensure-whatsapp-conversation-from-lead',
    params,
  );
}

// --- Borrado de mensajes ---

export async function deleteWhatsAppMessages(
  messageIds: string[],
  conversationId?: string,
): Promise<{ success: boolean; deleted: number }> {
  return invokeFn<{ success: boolean; deleted: number }>('delete-whatsapp-message-log-entry', {
    messageIds,
    ...(conversationId ? { conversationId } : {}),
  });
}

/** Debe coincidir con `DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE` en prosavis-firebase (deleteWhatsAppConversationAdmin). */
export const DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE = 'ELIMINAR_CONVERSACION_WHATSAPP';

export async function deleteWhatsAppConversationPermanently(
  conversationId: string,
  confirmation: string,
  options?: { blockUser?: boolean; deleteLeads?: boolean; phoneNumberId?: string },
): Promise<{
  success: boolean;
  messagesDeleted: number;
  storageFilesDeleted: number;
  conversationRemoved: boolean;
  leadsDeleted?: number;
  metaBlockAttempted?: boolean;
  metaBlockSuccess?: boolean;
  metaErrorCode?: string;
}> {
  return invokeFn<{
    success: boolean;
    messagesDeleted: number;
    storageFilesDeleted: number;
    conversationRemoved: boolean;
    leadsDeleted?: number;
    metaBlockAttempted?: boolean;
    metaBlockSuccess?: boolean;
    metaErrorCode?: string;
  }>('delete-whatsapp-conversation-admin', {
    conversationId,
    confirmation,
    ...options,
  });
}

// --- Block user (sin borrar conversación) ---

export async function blockWhatsAppUser(
  conversationId: string,
  phoneNumberId?: string,
): Promise<{
  success: boolean;
  blocklistEntries: number;
  metaBlockAttempted: boolean;
  metaBlockSuccess: boolean;
  metaErrorCode?: string;
}> {
  return invokeFn<{
    success: boolean;
    blocklistEntries: number;
    metaBlockAttempted: boolean;
    metaBlockSuccess: boolean;
    metaErrorCode?: string;
  }>('block-whatsapp-user-admin', {
    conversationId,
    ...(phoneNumberId ? { phoneNumberId } : {}),
  });
}

// --- Tags ---

export async function listWhatsAppTags(): Promise<WhatsAppTag[]> {
  const { data, error } = await supabase
    .from('whatsapp_chat_tags')
    .select('*')
    .eq('archived', false)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: TagRow) => ({
    id: row.id,
    name: row.name,
    color: row.color ?? undefined,
    createdAt: toDate(row.created_at),
    createdBy: row.created_by ?? undefined,
    archived: row.archived,
  }));
}

export async function createWhatsAppTag(
  name: string,
  color?: string,
): Promise<{ success: boolean; id: string }> {
  const { data, error } = await supabase
    .from('whatsapp_chat_tags')
    .insert({ name, color: color ?? '#1976d2' })
    .select('id')
    .single();
  if (error) throw error;
  return { success: true, id: data.id };
}

export async function updateWhatsAppTag(
  tagId: string,
  patch: { name?: string; color?: string },
): Promise<{ success: boolean }> {
  const { error } = await supabase.from('whatsapp_chat_tags').update(patch).eq('id', tagId);
  if (error) throw error;
  return { success: true };
}

export async function deleteWhatsAppTag(
  tagId: string,
): Promise<{ success: boolean }> {
  const { error } = await supabase
    .from('whatsapp_chat_tags')
    .update({ archived: true })
    .eq('id', tagId);
  if (error) throw error;
  return { success: true };
}

export async function assignWhatsAppTags(
  conversationId: string,
  tagIds: string[],
): Promise<{ success: boolean }> {
  const { error } = await supabase
    .from('whatsapp_conversations')
    .update({ tag_ids: tagIds })
    .eq('stable_key', conversationId);
  if (error) throw error;
  return { success: true };
}

function mapStickerDates(sticker: WhatsAppSticker): WhatsAppSticker {
  return {
    ...sticker,
    createdAt:
      sticker.createdAt instanceof Date
        ? sticker.createdAt
        : sticker.createdAt
          ? new Date(String(sticker.createdAt))
          : undefined,
    updatedAt:
      sticker.updatedAt instanceof Date
        ? sticker.updatedAt
        : sticker.updatedAt
          ? new Date(String(sticker.updatedAt))
          : undefined,
  };
}

export async function listWhatsAppStickers(): Promise<WhatsAppSticker[]> {
  const data = await invokeFn<{ stickers?: WhatsAppSticker[] }>('list-whatsapp-stickers', {});
  return (data.stickers || []).map(mapStickerDates);
}

export async function createWhatsAppSticker(params: {
  name: string;
  storagePath: string;
  downloadUrl: string;
  mimeType: 'image/webp';
  sizeBytes: number;
  isAnimated?: boolean;
}): Promise<{ success: boolean; id: string }> {
  return invokeFn<{ success: boolean; id: string }>('create-whatsapp-sticker', params);
}

export async function updateWhatsAppSticker(
  stickerId: string,
  patch: { name?: string; favorite?: boolean; archived?: boolean },
): Promise<{ success: boolean }> {
  return invokeFn<{ success: boolean }>('update-whatsapp-sticker', { stickerId, ...patch });
}

// --- Operator Snippets ---

export interface WhatsAppSnippet {
  id: string;
  shortcut: string;
  label: string;
  body: string;
}

export async function listWhatsAppSnippets(): Promise<WhatsAppSnippet[]> {
  const data = await invokeFn<{ snippets?: WhatsAppSnippet[]; error?: string }>(
    'list-whatsapp-snippets',
    {},
  );
  if (data.error) throw new Error(data.error);
  return data.snippets ?? [];
}

export async function createWhatsAppSnippet(
  shortcut: string,
  label: string,
  body: string,
): Promise<{ success: boolean; id: string }> {
  return invokeFn<{ success: boolean; id: string }>('create-whatsapp-snippet', {
    shortcut,
    label,
    body,
  });
}

export async function updateWhatsAppSnippet(
  snippetId: string,
  patch: { shortcut?: string; label?: string; body?: string },
): Promise<{ success: boolean }> {
  return invokeFn<{ success: boolean }>('update-whatsapp-snippet', { snippetId, ...patch });
}

export async function deleteWhatsAppSnippet(
  snippetId: string,
): Promise<{ success: boolean }> {
  return invokeFn<{ success: boolean }>('delete-whatsapp-snippet', { snippetId });
}

// --- WABA Business Profile ---

export interface WhatsAppBusinessProfile {
  about: string;
  address: string;
  description: string;
  email: string;
  vertical: string;
  websites: string[];
  profilePictureUrl: string;
}

function normalizeWhatsAppBusinessProfile(
  raw?: Partial<WhatsAppBusinessProfile> | null,
): WhatsAppBusinessProfile {
  return {
    about: raw?.about ?? '',
    address: raw?.address ?? '',
    description: raw?.description ?? '',
    email: raw?.email ?? '',
    vertical: raw?.vertical ?? '',
    websites: Array.isArray(raw?.websites) ? raw.websites : [],
    profilePictureUrl: raw?.profilePictureUrl ?? '',
  };
}

export async function getWhatsAppBusinessProfile(
  phoneNumberId?: string,
): Promise<WhatsAppBusinessProfile> {
  const data = await invokeFn<{ profile?: Partial<WhatsAppBusinessProfile>; error?: string }>(
    'get-whatsapp-business-profile',
    { phoneNumberId },
  );
  if (data.error) throw new Error(data.error);
  return normalizeWhatsAppBusinessProfile(data.profile);
}

export async function updateWhatsAppBusinessProfile(
  profile: Partial<Omit<WhatsAppBusinessProfile, 'profilePictureUrl'>>,
  phoneNumberId?: string,
): Promise<{ success: boolean }> {
  return invokeFn<{ success: boolean }>('update-whatsapp-business-profile', {
    phoneNumberId,
    profile,
  });
}

// --- Media download utility ---

export async function downloadMediaBlob(
  url: string,
  filename: string,
): Promise<void> {
  const response = await fetch(url);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

const MIME_TO_EXT: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/mp4': 'm4a',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'application/pdf': 'pdf',
};

export function getExtensionFromMime(mime: string): string {
  return MIME_TO_EXT[mime] || 'bin';
}

/**
 * Mapeo MIME → tipo Cloud API y límite Meta (MB) para envío saliente desde Inbox.
 * Refs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 */
export interface OutboundMediaSpec {
  mediaType: WhatsAppOutboundMediaType;
  maxSizeMB: number;
  /** Etiqueta humana para errores. */
  label: string;
}

const OUTBOUND_MEDIA_BY_MIME: Record<string, OutboundMediaSpec> = {
  // Imágenes (Meta: 5 MB)
  'image/jpeg': { mediaType: 'image', maxSizeMB: 5, label: 'imagen JPEG' },
  'image/jpg': { mediaType: 'image', maxSizeMB: 5, label: 'imagen JPEG' },
  'image/png': { mediaType: 'image', maxSizeMB: 5, label: 'imagen PNG' },
  'image/webp': { mediaType: 'sticker', maxSizeMB: 0.49, label: 'sticker WebP' },
  // Audio (Meta: 16 MB) — formatos oficiales aceptados por WhatsApp Cloud API.
  // `audio/webm` queda fuera a propósito: aunque MediaRecorder lo produce en Chromium,
  // Meta lo rechaza con `errorCode: 131053 (Media upload error)`. Las notas de voz se
  // generan con `voiceRecorder.ts` (opus-recorder → OGG/Opus mono) que cae en `audio/ogg`.
  'audio/aac': { mediaType: 'audio', maxSizeMB: 16, label: 'audio AAC' },
  'audio/mp4': { mediaType: 'audio', maxSizeMB: 16, label: 'audio M4A' },
  'audio/mpeg': { mediaType: 'audio', maxSizeMB: 16, label: 'audio MP3' },
  'audio/amr': { mediaType: 'audio', maxSizeMB: 16, label: 'audio AMR' },
  'audio/ogg': { mediaType: 'audio', maxSizeMB: 16, label: 'audio OGG' },
  // Video (Meta: 16 MB)
  'video/mp4': { mediaType: 'video', maxSizeMB: 16, label: 'video MP4' },
  'video/3gpp': { mediaType: 'video', maxSizeMB: 16, label: 'video 3GPP' },
  // Documentos (Meta: 100 MB)
  'application/pdf': { mediaType: 'document', maxSizeMB: 100, label: 'PDF' },
  'application/vnd.ms-excel': { mediaType: 'document', maxSizeMB: 100, label: 'Excel' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    mediaType: 'document',
    maxSizeMB: 100,
    label: 'Excel',
  },
  'application/msword': { mediaType: 'document', maxSizeMB: 100, label: 'Word' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    mediaType: 'document',
    maxSizeMB: 100,
    label: 'Word',
  },
  'application/vnd.ms-powerpoint': { mediaType: 'document', maxSizeMB: 100, label: 'PowerPoint' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    mediaType: 'document',
    maxSizeMB: 100,
    label: 'PowerPoint',
  },
  'text/plain': { mediaType: 'document', maxSizeMB: 100, label: 'texto' },
};

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  amr: 'audio/amr',
  mp4: 'video/mp4',
  '3gp': 'video/3gpp',
};

// =============================================================================
// PRESENCIA MULTI-ADMIN (inbox WhatsApp)
// Cada pestaña admin escribe su propio doc en `whatsapp_admin_presence/{uid}`
// y se suscribe al resto filtrando por `phoneNumberId`. El TTL se filtra
// en cliente (entradas con updatedAt > PRESENCE_TTL_MS se ignoran).
// =============================================================================

export type WhatsAppAdminPresenceActivity = 'viewing' | 'typing' | 'none';

export interface WhatsAppAdminPresence {
  uid: string;
  phoneNumberId?: string | null;
  conversationId?: string | null;
  displayName?: string | null;
  activity: WhatsAppAdminPresenceActivity;
  updatedAt?: Date;
}

/** Ventana en ms para considerar una presencia como "viva" (clientes con reloj desincronizado). */
export const PRESENCE_TTL_MS = 45_000;

function mapPresenceRow(row: PresenceRow): WhatsAppAdminPresence {
  return {
    uid: row.admin_uid ?? row.id,
    phoneNumberId: row.conversation_stable_key ? null : null,
    conversationId: row.conversation_stable_key,
    displayName: row.admin_email,
    activity: (row.typing ? 'typing' : row.status === 'viewing' ? 'viewing' : 'none') as WhatsAppAdminPresenceActivity,
    updatedAt: toDate(row.last_seen_at),
  };
}

export function subscribeToWhatsAppAdminPresence(
  phoneNumberId: string,
  onNext: (entries: WhatsAppAdminPresence[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let channel: RealtimeChannel | null = null;
  const load = async () => {
    try {
      const { data, error } = await supabase.from('whatsapp_admin_presence').select('*');
      if (error) throw error;
      const now = Date.now();
      const entries = (data ?? [])
        .map(mapPresenceRow)
        .filter((e) => e.updatedAt && now - e.updatedAt.getTime() < PRESENCE_TTL_MS);
      onNext(entries);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };
  void load();
  channel = supabase
    .channel(`whatsapp-presence:${phoneNumberId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'whatsapp_admin_presence' },
      () => void load(),
    )
    .subscribe();
  return () => {
    if (channel) void supabase.removeChannel(channel);
  };
}

export async function setMyWhatsAppPresence(
  uid: string,
  partial: Partial<Omit<WhatsAppAdminPresence, 'uid' | 'updatedAt'>>,
): Promise<void> {
  const { error } = await supabase.from('whatsapp_admin_presence').upsert({
    admin_uid: uid,
    conversation_stable_key: partial.conversationId ?? null,
    admin_email: partial.displayName ?? null,
    status: partial.activity === 'typing' ? 'typing' : partial.activity === 'viewing' ? 'viewing' : 'none',
    typing: partial.activity === 'typing',
    last_seen_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function clearMyWhatsAppPresence(uid: string): Promise<void> {
  try {
    await supabase.from('whatsapp_admin_presence').delete().eq('admin_uid', uid);
  } catch (err) {
    console.warn('[clearMyWhatsAppPresence] delete failed:', err);
  }
}

export async function getWhatsAppMediaSignedUrl(params: {
  mediaAssetId?: string;
  storagePath?: string;
  bucketId?: string;
  expiresIn?: number;
}): Promise<string> {
  const data = await invokeFn<{ signedUrl: string }>('get-whatsapp-media-signed-url', params);
  return data.signedUrl;
}

export async function listWhatsAppMessageLog(filters: {
  days?: number;
  status?: string;
  search?: string;
  phoneNumberId?: string;
  limit?: number;
} = {}): Promise<WhatsAppMessage[]> {
  const rows = await invokeFn<MessageRow[]>('list-whatsapp-message-log', filters);
  return (rows ?? []).map(mapMessageRow);
}

export async function getWhatsAppMetrics(days = 30, phoneNumberId?: string) {
  return invokeFn('get-whatsapp-metrics', { days, phoneNumberId });
}

export async function purgeWhatsAppMessageLog(params: {
  confirmation: string;
  phoneNumberId?: string;
  scope?: 'line' | 'all';
}) {
  return invokeFn('purge-whatsapp-message-log', params);
}

export function resolveOutboundMediaSpec(file: File): OutboundMediaSpec | null {
  const mime = (file.type || '').toLowerCase();
  if (mime && OUTBOUND_MEDIA_BY_MIME[mime]) return OUTBOUND_MEDIA_BY_MIME[mime];
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const fallbackMime = EXT_TO_MIME[ext];
  if (fallbackMime && OUTBOUND_MEDIA_BY_MIME[fallbackMime]) return OUTBOUND_MEDIA_BY_MIME[fallbackMime];
  if (ext) {
    return { mediaType: 'document', maxSizeMB: 100, label: 'documento' };
  }
  return null;
}
