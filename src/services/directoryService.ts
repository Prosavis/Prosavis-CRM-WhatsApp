import { supabase } from '@/config/supabase';
import type { DirectoryEntry, DirectoryClassification } from '@/types/lead';
import type { Database } from '@/types/database';
import {
  directoryPhoneKey,
  directoryPhoneLookupVariants,
  normalizeDirectoryPhoneE164,
} from '@/utils/directoryPhone';

type DirectoryRow = Database['public']['Tables']['crm_directory']['Row'];

// ──────────────────────────────────────────────
// Mapping helpers
// ──────────────────────────────────────────────

function mapRowToEntry(row: DirectoryRow): DirectoryEntry {
  return {
    id: row.id,
    fullName: row.full_name,
    displayName: row.display_name ?? undefined,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    photoUrl: row.photo_url ?? undefined,
    address: row.address ?? undefined,
    notes: row.notes ?? undefined,
    appUserId: row.app_user_id ?? undefined,
    isAppUser: row.is_app_user,
    providerId: row.provider_id ?? undefined,
    serviceId: row.service_id ?? undefined,
    classification: row.classification as DirectoryClassification,
    qualityTag: row.quality_tag as DirectoryEntry['qualityTag'],
    status: row.status,
    source: row.source ?? undefined,
    channels: (row.channels ?? []) as DirectoryEntry['channels'],
    paymentStatus: row.payment_status ?? undefined,
    pendingAmount: row.pending_amount,
    pendingAppointmentsCount: row.pending_appointments_count,
    lastChargedAmount: row.last_charged_amount ?? undefined,
    otpRequired: row.otp_required,
    preferredServiceAddressLine: row.preferred_service_address_line ?? undefined,
    preferredServiceAddressRef: row.preferred_service_address_ref ?? undefined,
    firstContactAt: row.first_contact_at ?? undefined,
    lastContactAt: row.last_contact_at ?? undefined,
    messagesCount: row.messages_count,
    activeSequence: row.active_sequence,
    sequenceStep: row.sequence_step,
    optOut: row.opt_out,
    lastResponseText: row.last_response_text ?? undefined,
    lastResponseAt: row.last_response_at ?? undefined,
    lastWhatsAppMessageAt: row.last_whatsapp_message_at ?? undefined,
    lastWhatsAppMessageText: row.last_whatsapp_message_text ?? undefined,
    lastWhatsAppIntent: row.last_whatsapp_intent ?? undefined,
    unreadWhatsAppCount: row.unread_whatsapp_count,
    whatsAppAssignedTo: row.whatsapp_assigned_to ?? undefined,
    whatsAppConversationId: row.whatsapp_conversation_id ?? undefined,
    appointmentId: row.appointment_id ?? undefined,
    internalNotes: row.internal_notes ?? undefined,
    tags: row.tags ?? [],
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncedAt: row.last_synced_at ?? undefined,
  };
}

function toDbEntry(data: Partial<DirectoryEntry>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (data.fullName !== undefined) row.full_name = data.fullName;
  if (data.displayName !== undefined) row.display_name = data.displayName;
  if (data.email !== undefined) row.email = data.email;
  if (data.phone !== undefined) row.phone = data.phone;
  if (data.photoUrl !== undefined) row.photo_url = data.photoUrl;
  if (data.address !== undefined) row.address = data.address;
  if (data.notes !== undefined) row.notes = data.notes;
  if (data.appUserId !== undefined) row.app_user_id = data.appUserId;
  if (data.isAppUser !== undefined) row.is_app_user = data.isAppUser;
  if (data.providerId !== undefined) row.provider_id = data.providerId;
  if (data.serviceId !== undefined) row.service_id = data.serviceId;
  if (data.classification !== undefined) row.classification = data.classification;
  if (data.qualityTag !== undefined) row.quality_tag = data.qualityTag;
  if (data.status !== undefined) row.status = data.status;
  if (data.source !== undefined) row.source = data.source;
  if (data.channels !== undefined) row.channels = data.channels;
  if (data.paymentStatus !== undefined) row.payment_status = data.paymentStatus;
  if (data.pendingAmount !== undefined) row.pending_amount = data.pendingAmount;
  if (data.pendingAppointmentsCount !== undefined) row.pending_appointments_count = data.pendingAppointmentsCount;
  if (data.lastChargedAmount !== undefined) row.last_charged_amount = data.lastChargedAmount;
  if (data.otpRequired !== undefined) row.otp_required = data.otpRequired;
  if (data.preferredServiceAddressLine !== undefined) row.preferred_service_address_line = data.preferredServiceAddressLine;
  if (data.preferredServiceAddressRef !== undefined) row.preferred_service_address_ref = data.preferredServiceAddressRef;
  if (data.firstContactAt !== undefined) row.first_contact_at = data.firstContactAt;
  if (data.lastContactAt !== undefined) row.last_contact_at = data.lastContactAt;
  if (data.messagesCount !== undefined) row.messages_count = data.messagesCount;
  if (data.activeSequence !== undefined) row.active_sequence = data.activeSequence;
  if (data.sequenceStep !== undefined) row.sequence_step = data.sequenceStep;
  if (data.optOut !== undefined) row.opt_out = data.optOut;
  if (data.lastResponseText !== undefined) row.last_response_text = data.lastResponseText;
  if (data.lastResponseAt !== undefined) row.last_response_at = data.lastResponseAt;
  if (data.lastWhatsAppMessageAt !== undefined) row.last_whatsapp_message_at = data.lastWhatsAppMessageAt;
  if (data.lastWhatsAppMessageText !== undefined) row.last_whatsapp_message_text = data.lastWhatsAppMessageText;
  if (data.lastWhatsAppIntent !== undefined) row.last_whatsapp_intent = data.lastWhatsAppIntent;
  if (data.unreadWhatsAppCount !== undefined) row.unread_whatsapp_count = data.unreadWhatsAppCount;
  if (data.whatsAppAssignedTo !== undefined) row.whatsapp_assigned_to = data.whatsAppAssignedTo;
  if (data.whatsAppConversationId !== undefined) row.whatsapp_conversation_id = data.whatsAppConversationId;
  if (data.appointmentId !== undefined) row.appointment_id = data.appointmentId;
  if (data.internalNotes !== undefined) row.internal_notes = data.internalNotes;
  if (data.tags !== undefined) row.tags = data.tags;
  if (data.metadata !== undefined) row.metadata = data.metadata;
  return row;
}

// ──────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────

export const directoryService = {
  /**
   * Create a new entry in crm_directory.
   */
  async createEntry(data: Partial<DirectoryEntry>) {
    const row = toDbEntry(data);
    if (row.phone && typeof row.phone === 'string') {
      row.phone =
        normalizeDirectoryPhoneE164(row.phone) ?? row.phone;
    }
    if (row.email && typeof row.email === 'string') {
      row.email = row.email.trim().toLowerCase();
    }

    const { data: id, error } = await supabase.rpc('upsert_directory_entry', {
      p_entry: row,
      p_overwrite_classification: false,
    });
    if (error) throw error;
    return { id: id as string, success: true };
  },

  /**
   * Update an existing entry in crm_directory.
   */
  async updateEntry(entryId: string, data: Partial<DirectoryEntry>) {
    const row = toDbEntry(data);
    if (row.phone && typeof row.phone === 'string') {
      row.phone =
        normalizeDirectoryPhoneE164(row.phone) ?? row.phone;
    }
    if (row.email && typeof row.email === 'string') {
      row.email = row.email.trim().toLowerCase();
    }
    const { error } = await supabase
      .from('crm_directory')
      .update(row)
      .eq('id', entryId);
    if (error) throw error;
    return { success: true };
  },

  /** Busca entradas por teléfono (variantes E.164 / dígitos). */
  async findByPhone(phone: string): Promise<DirectoryEntry[]> {
    const key = directoryPhoneKey(phone);
    const variants = directoryPhoneLookupVariants(phone);
    if (!key && variants.length === 0) return [];

    const rows: DirectoryRow[] = [];

    if (key) {
      const { data, error } = await supabase
        .from('crm_directory')
        .select('*')
        .eq('phone_key', key);
      if (error) throw error;
      rows.push(...((data ?? []) as DirectoryRow[]));
    }

    if (rows.length === 0 && variants.length > 0) {
      const { data, error } = await supabase
        .from('crm_directory')
        .select('*')
        .in('phone', variants);
      if (error) throw error;
      rows.push(...((data ?? []) as DirectoryRow[]));
    }

    const seen = new Set<string>();
    return rows
      .filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      })
      .map((row) => mapRowToEntry(row));
  },

  /**
   * Fetch a single entry by ID.
   */
  async getEntryById(id: string): Promise<DirectoryEntry | null> {
    const { data, error } = await supabase
      .from('crm_directory')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRowToEntry(data as DirectoryRow) : null;
  },

  /**
   * Fetch paginated directory entries with optional filters.
   */
  async getEntries(filters?: {
    status?: string;
    source?: string;
    classification?: string;
    qualityTag?: string;
    optOut?: boolean;
    assignedTo?: string;
    limit?: number;
    page?: number;
    searchTerm?: string;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
    phoneNull?: boolean;
    emailNull?: boolean;
  }) {
    const limit = filters?.limit ?? 25;
    const page = filters?.page ?? 0;
    const from = page * limit;
    const to = from + limit - 1;
    const sortField = filters?.sortField ?? 'created_at';
    const ascending = filters?.sortDirection === 'asc';

    let query = supabase.from('crm_directory').select('*', { count: 'exact' });

    if (filters?.status === 'active') {
      query = query.or('status.eq.active,whatsapp_conversation_id.not.is.null').eq('opt_out', false);
    } else if (filters?.status === 'inactive') {
      query = query
        .eq('status', 'inactive')
        .is('whatsapp_conversation_id', null)
        .eq('opt_out', false);
    } else if (filters?.status === 'opt_out') {
      query = query.or('opt_out.eq.true,status.eq.opt_out');
    } else if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.source) query = query.eq('source', filters.source);
    if (filters?.classification) query = query.eq('classification', filters.classification);
    if (filters?.qualityTag) query = query.eq('quality_tag', filters.qualityTag);
    if (typeof filters?.optOut === 'boolean') query = query.eq('opt_out', filters.optOut);
    if (filters?.assignedTo) query = query.eq('whatsapp_assigned_to', filters.assignedTo);
    if (filters?.searchTerm?.trim()) {
      const term = `%${filters.searchTerm.trim()}%`;
      query = query.or(
        `full_name.ilike.${term},phone.ilike.${term},email.ilike.${term},display_name.ilike.${term}`,
      );
    }
    if (filters?.phoneNull) query = query.is('phone', null);
    if (filters?.emailNull) query = query.is('email', null);

    query = query.order(sortField, { ascending }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const entries = (data ?? []).map((row) => mapRowToEntry(row as DirectoryRow));
    return {
      entries,
      count: entries.length,
      totalCount: count ?? entries.length,
      lastDocId: entries.at(-1)?.id ?? null,
    };
  },

  /**
   * Search for directory entries by name, phone, or email.
   */
  async search(query: string) {
    if (!query.trim()) return [];
    const term = `%${query.trim()}%`;
    const { data, error } = await supabase
      .from('crm_directory')
      .select('*')
      .or(`full_name.ilike.${term},phone.ilike.${term},email.ilike.${term},display_name.ilike.${term}`)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data ?? []).map((row) => mapRowToEntry(row as DirectoryRow));
  },

  /**
   * Fetch all phone numbers for bulk WhatsApp sending.
   */
  async fetchAllPhonesForBulk(options?: { pageSize?: number; maxPages?: number }) {
    const pageSize = options?.pageSize ?? 500;
    const maxPages = options?.maxPages ?? 200;
    const phones = new Set<string>();

    for (let page = 0; page < maxPages; page++) {
      const result = await this.getEntries({
        limit: pageSize,
        page,
        sortField: 'created_at',
        sortDirection: 'desc',
      });
      for (const entry of result.entries) {
        if (!entry.phone) continue;
        const digits = entry.phone.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 15) phones.add(digits);
      }
      if (result.entries.length < pageSize) break;
    }
    return [...phones];
  },

  /**
   * Get directory statistics (conteos exactos vía PostgREST, sin límite de filas).
   */
  async getStats() {
    const countRows = async (applyFilter?: (query: any) => any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase.from('crm_directory') as any).select('*', { count: 'exact', head: true });
      if (applyFilter) {
        query = applyFilter(query);
      }
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    };

    const [total, active, inactive, optOut] = await Promise.all([
      countRows(),
      countRows((query) =>
        query.or('status.eq.active,whatsapp_conversation_id.not.is.null').eq('opt_out', false),
      ),
      countRows((query) =>
        query.eq('status', 'inactive').is('whatsapp_conversation_id', null).eq('opt_out', false),
      ),
      countRows((query) => query.or('opt_out.eq.true,status.eq.opt_out')),
    ]);

    return {
      total,
      active,
      inactive,
      optOut,
      byClassification: {} as Record<string, number>,
      bySource: {} as Record<string, number>,
    };
  },

  /**
   * Seed: Convert all Firebase users into directory entries.
   * Actual implementation calls the cloud function / edge function.
   */
  async seedAllUsersAsEntries() {
    // TODO: implement actual sync from Firebase users to crm_directory
    return { created: 0, skipped: 0, errors: 0 };
  },
};
