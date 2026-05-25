export interface WhatsAppConversation {
  id: string;
  stableKey: string;
  phone?: string;
  bsuid?: string;
  state: 'active' | 'escalated' | 'resolved';
  lastMessageText?: string;
  lastMessageAt?: Date;
  lastMessageDirection?: 'inbound' | 'outbound';
  lastMessageOutboundStatus?: string;
  unreadCount: number;
  contactName?: string;
  contactPhone?: string;
  contactPhotoUrl?: string;
  whatsappProfileName?: string;
  adminNotes?: string;
  assignedTo?: string;
  phoneNumberId?: string;
  automatedInboundDisabled?: boolean;
  tagIds: string[];
  isArchived?: boolean;
  archivedAt?: Date;
  isPinned?: boolean;
  pinnedAt?: Date;
  crmForceUnread?: boolean;
}

export interface WhatsAppMessage {
  id: string;
  conversationStableKey: string;
  recipientPhone?: string;
  recipientBsuid?: string;
  direction: 'inbound' | 'outbound';
  senderType: 'bot' | 'agent' | 'system' | 'user';
  agentUid?: string;
  messageBody?: string;
  mediaType?: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  mediaUrl?: string;
  storageUrl?: string;
  storagePath?: string;
  caption?: string;
  filename?: string;
  mimeType?: string;
  status: string;
  waMessageId?: string;
  intent?: string;
  templateName?: string;
  campaignType?: string;
  phoneNumberId?: string;
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

export interface WhatsAppMetrics {
  period: { from: string; to: string };
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  reachedDevice: number;
  totalFailed: number;
  totalResponses: number;
  responseRate: number;
  optOutCount: number;
  byCampaign: Record<
    string,
    {
      sent: number;
      delivered: number;
      read: number;
      failed: number;
      outboundOk: number;
    }
  >;
  leads: {
    total: number;
    enSeguimiento: number;
    enRebooking: number;
    optOut: number;
    agendados: number;
  };
}

export interface MessageLogFilters {
  days?: number;
  status?: string;
  search?: string;
  phoneNumberId?: string;
  limit?: number;
}
