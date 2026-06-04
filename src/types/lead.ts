/** @deprecated Use DirectoryEntry instead. */
export type LeadSequenceType =
  | 'SEGUIMIENTO'
  | 'REBOOKING'
  | 'SEGUIMIENTO_PAGO_RECHAZADO'
  | 'NINGUNA';

/** @deprecated Use DirectoryEntry fields instead. */
export type LeadStatus =
  | 'PENDIENTE'
  | 'NO_AGENDO'
  | 'AGENDADO'
  | 'COMPLETADO'
  | 'OPT_OUT'
  | 'PAGO_RECHAZADO';

/** @deprecated Use DirectoryEntry fields instead. */
export type LeadSource =
  | 'META_ADS'
  | 'REFERIDO'
  | 'ORGANICO'
  | 'BROADCAST'
  | 'WHATSAPP_INBOUND'
  | 'PANEL'
  | 'APP_USER';

/** @deprecated Use DirectoryEntry fields instead. */
export type LeadChannel = 'WHATSAPP' | 'IN_APP';

// ──────────────────────────────────────────────
// New DirectoryEntry types (matches crm_directory schema)
// ──────────────────────────────────────────────

export type DirectoryClassification = 'company' | 'user' | 'lead' | 'unknown';
export type DirectoryQualityTag = 'good' | 'standard' | 'bad';
export type DirectoryStatus = 'active' | 'inactive' | 'opt_out';
export type DirectoryChannel = 'WHATSAPP' | 'IN_APP';
export type DirectorySource =
  | 'APP_USER'
  | 'WHATSAPP_INBOUND'
  | 'META_ADS'
  | 'REFERIDO'
  | 'ORGANICO'
  | 'BROADCAST'
  | 'PANEL';

export interface DirectoryEntry {
  id: string;

  // Identity
  fullName: string;
  displayName?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  address?: string;
  notes?: string;

  // Vinculaciones
  appUserId?: string;
  isAppUser: boolean;
  providerId?: string;
  serviceId?: string;

  // CRM Classification
  classification: DirectoryClassification;
  qualityTag: DirectoryQualityTag;
  status: DirectoryStatus | string;
  source?: DirectorySource | string;
  channels: DirectoryChannel[];

  // Payment / billing
  paymentStatus?: 'paid' | 'pending' | string;
  pendingAmount: number;
  pendingAppointmentsCount: number;
  lastChargedAmount?: number;
  otpRequired: boolean;
  preferredServiceAddressLine?: string;
  preferredServiceAddressRef?: string;

  // Lead tracking
  firstContactAt?: string;
  lastContactAt?: string;
  messagesCount: number;
  activeSequence: string;
  sequenceStep: number;
  optOut: boolean;
  lastResponseText?: string;
  lastResponseAt?: string;
  appointmentId?: string;

  // WhatsApp enrichment
  lastWhatsAppMessageAt?: string;
  lastWhatsAppMessageText?: string;
  lastWhatsAppIntent?: string;
  unreadWhatsAppCount: number;
  whatsAppAssignedTo?: string;
  whatsAppConversationId?: string;

  // Internal
  internalNotes?: string;
  tags: string[];
  metadata: Record<string, unknown>;

  // Audit
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
}

// ──────────────────────────────────────────────
// Backward compatibility: Lead = DirectoryEntry
// ──────────────────────────────────────────────
/** @deprecated Use DirectoryEntry instead. */
export type Lead = DirectoryEntry;

/** @deprecated Use DirectoryClassification instead. */
export type DirectoryEntryClassification = DirectoryClassification;
/** @deprecated Use DirectoryStatus instead. */
export type DirectoryEntryStatus = DirectoryStatus;
/** @deprecated Use DirectoryChannel instead. */
export type DirectoryEntryChannel = DirectoryChannel;
