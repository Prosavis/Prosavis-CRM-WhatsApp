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

export interface OutboundMetricsBucket {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  outboundOk: number;
  total?: number;
}

export interface InboundTimeseriesPoint {
  bucket: string;
  messagesReceived: number;
  uniquePeople: number;
  newPeople: number;
  existingPeople: number;
}

export interface CompletedServicesTimeseriesPoint {
  bucket: string;
  completed: number;
}

/** Cita COMPLETED inspectable en el drill-down de «Servicios completados». */
export interface CompletedAppointmentDetail {
  id: string;
  /** ISO de scheduledDate. */
  scheduledDate: string;
  clientName: string | null;
  clientPhone: string | null;
  providerName: string | null;
  teamMemberId: string | null;
  /** Duración en minutos. */
  duration: number | null;
  totalAmount: number | null;
  paidAmount: number | null;
  pendingAmount: number | null;
  paymentStatus: string | null;
  addressLine: string | null;
  serviceTitle: string | null;
}

/** Comparación precalculada current vs previous (crecimiento % o null). */
export interface CompletedComparison {
  current: number;
  previous: number;
  growth: number | null;
}

export interface MetricsGranularSeries<T> {
  day: T[];
  week: T[];
  month: T[];
}

export interface ClientSegmentsMetrics {
  /** Público de interés: directorio activo sin TEST (audiencia app + WhatsApp). */
  total: number;
  /** Clientes reales: agendaron al menos una vez (respaldado por cita en Firebase). */
  clients: number;
  company: number;
  recurring: number;
  /** Clientes no blacklisted con última cita dentro de los últimos 30 días. */
  active: number;
  /** Clientes no blacklisted con última cita hace más de 30 días (reactivar). */
  inactive: number;
  /** Contactos con tag Favoritos (marcado manual). */
  favorites: number;
  /** Clientes reales en lista negra (Decline/🚫/Bloqueado o whatsapp_blocklist). */
  blacklist: number;
}

export interface DirectoryClientMetricRow {
  id: string;
  name: string | null;
  phone: string | null;
  classification: string | null;
  tags: string[];
  isCompany: boolean;
  isRecurring: boolean;
  isAgendado: boolean;
  /** Tag Favoritos (marcado manual). */
  isFavorite: boolean;
  /** Es cliente real (tiene al menos una cita en Firebase). */
  isClient: boolean;
  /** Última cita dentro de los últimos 30 días (y no blacklisted). */
  isActive: boolean;
  /** En lista negra (tag Decline/🚫/Bloqueado o whatsapp_blocklist). */
  isBlacklisted: boolean;
  /**
   * Motivo humano de lista negra (clientes).
   * Prioridad: crm_directory.internal_notes → whatsapp_blocklist.reason
   * (excluye tokens técnicos directory_tag / tag_blacklist / inbox).
   */
  blacklistReason: string | null;
  /** Fecha ISO de la última cita agendada, o null si nunca agendó. */
  lastAppointmentDate: string | null;
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
  uniqueContactsMessaged?: number;
  uniqueContactsResponded?: number;
  byCampaign: Record<string, OutboundMetricsBucket>;
  byTemplate?: Record<string, OutboundMetricsBucket>;
  byKind?: {
    session: OutboundMetricsBucket;
    template: OutboundMetricsBucket;
  };
  leads: {
    total: number;
    enSeguimiento: number;
    enRebooking: number;
    optOut: number;
    agendados: number;
  };
  inboundTimeseries?: MetricsGranularSeries<InboundTimeseriesPoint>;
  clientSegments?: ClientSegmentsMetrics;
  directoryClients?: DirectoryClientMetricRow[];
  completedServicesTimeseries?: MetricsGranularSeries<CompletedServicesTimeseriesPoint>;
  completedAppointments?: CompletedAppointmentDetail[];
  completedMeta?: {
    windowMonths: number;
    windowFrom: string;
    windowTo: string;
    totalCompleted: number;
    inSelectedPeriod: number;
    lastCompletedDate: string | null;
    /** Día Bogotá "hoy" (YYYY-MM-DD) usado en las comparaciones. */
    today?: string;
    /** Mes en curso (YYYY-MM). */
    currentMonth?: string;
    comparisons?: {
      mtd: CompletedComparison;
      rolling30d: CompletedComparison;
      lastClosedMonth: (CompletedComparison & { month: string }) | null;
    };
  };
  dataQuality?: {
    messageLogRows: number;
    directoryRows: number;
    appointmentRows: number;
    clientAppointmentRows?: number;
  };
}

export interface MessageLogFilters {
  days?: number;
  status?: string;
  search?: string;
  phoneNumberId?: string;
  limit?: number;
}
