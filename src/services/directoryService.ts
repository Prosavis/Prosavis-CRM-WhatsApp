import { supabase } from '@/config/supabase';
import {
  BULK_DIRECTORY_DEFAULT_SORT_DIRECTION,
  BULK_DIRECTORY_DEFAULT_SORT_FIELD,
  type BulkDirectorySortDirection,
  type BulkDirectorySortField,
} from '@/components/whatsapp/bulk/bulkSendTypes';
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

export function mapRowToEntry(row: DirectoryRow): DirectoryEntry {
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

export type DirectoryBulkFilters = {
  status?: string;
  source?: string;
  /** @deprecated Usar includeClassifications */
  classification?: string;
  searchTerm?: string;
  includeOptOut?: boolean;
  limit?: number;
  page?: number;
  sortField?: BulkDirectorySortField;
  sortDirection?: BulkDirectorySortDirection;
  includeWaTagIds?: string[];
  excludeWaTagIds?: string[];
  waTagMatchAll?: boolean;
  includeDirectoryTags?: string[];
  excludeDirectoryTags?: string[];
  directoryTagMatchAll?: boolean;
  includeClassifications?: string[];
  excludeClassifications?: string[];
  includeQualityTags?: string[];
  excludeQualityTags?: string[];
};

type BulkFilteredRpcRow = DirectoryRow & { total_count: number };

function buildBulkFilteredRpcParams(filters?: DirectoryBulkFilters) {
  const limit = filters?.limit ?? 50;
  const page = filters?.page ?? 0;

  let includeClassifications = filters?.includeClassifications;
  let excludeClassifications = filters?.excludeClassifications;
  if (filters?.classification?.trim()) {
    includeClassifications = [filters.classification.trim()];
    excludeClassifications = undefined;
  }

  return {
    p_search_term: filters?.searchTerm?.trim() || null,
    p_status: filters?.status || null,
    p_source: filters?.source || null,
    p_include_opt_out: filters?.includeOptOut === true,
    p_include_wa_tag_ids:
      filters?.includeWaTagIds && filters.includeWaTagIds.length > 0
        ? filters.includeWaTagIds
        : null,
    p_exclude_wa_tag_ids:
      filters?.excludeWaTagIds && filters.excludeWaTagIds.length > 0
        ? filters.excludeWaTagIds
        : null,
    p_wa_tag_match_all: filters?.waTagMatchAll === true,
    p_include_directory_tags:
      filters?.includeDirectoryTags && filters.includeDirectoryTags.length > 0
        ? filters.includeDirectoryTags
        : null,
    p_exclude_directory_tags:
      filters?.excludeDirectoryTags && filters.excludeDirectoryTags.length > 0
        ? filters.excludeDirectoryTags
        : null,
    p_directory_tag_match_all: filters?.directoryTagMatchAll === true,
    p_include_classifications:
      includeClassifications && includeClassifications.length > 0
        ? includeClassifications
        : null,
    p_exclude_classifications:
      excludeClassifications && excludeClassifications.length > 0
        ? excludeClassifications
        : null,
    p_include_quality_tags:
      filters?.includeQualityTags && filters.includeQualityTags.length > 0
        ? filters.includeQualityTags
        : null,
    p_exclude_quality_tags:
      filters?.excludeQualityTags && filters.excludeQualityTags.length > 0
        ? filters.excludeQualityTags
        : null,
    p_sort_field: filters?.sortField ?? BULK_DIRECTORY_DEFAULT_SORT_FIELD,
    p_sort_direction: filters?.sortDirection ?? BULK_DIRECTORY_DEFAULT_SORT_DIRECTION,
    p_limit: limit,
    p_offset: page * limit,
  };
}

function mapBulkRpcRows(rows: BulkFilteredRpcRow[]) {
  const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const entries = rows.map((row) => {
    const { total_count: _total, ...directoryRow } = row;
    return mapRowToEntry(directoryRow as DirectoryRow);
  });
  return { entries, totalCount };
}

function isValidBulkPhone(phone: string | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
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
   * Update an existing entry via upsert_directory_entry (merge por phone_key/email).
   * Evita duplicados al añadir teléfono o al sincronizar desde WhatsApp.
   */
  async updateEntry(entryId: string, data: Partial<DirectoryEntry>) {
    const existing = await this.getEntryById(entryId);
    if (!existing) {
      throw new Error(`Directorio: entrada no encontrada (${entryId})`);
    }

    const merged: Partial<DirectoryEntry> = { ...existing, ...data };
    const row = toDbEntry(merged);
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

  /** Busca entrada por Firebase app_user_id. */
  async findByAppUserId(appUserId: string): Promise<DirectoryEntry | null> {
    const { data, error } = await supabase
      .from('crm_directory')
      .select('*')
      .eq('app_user_id', appUserId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRowToEntry(data as DirectoryRow) : null;
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
   * Paginated directory entries for bulk send (phone required, opt_out excluded by default).
   */
  async getEntriesForBulk(filters?: DirectoryBulkFilters) {
    const { data, error } = await supabase.rpc(
      'get_crm_directory_bulk_filtered',
      buildBulkFilteredRpcParams(filters),
    );
    if (error) throw error;

    const { entries, totalCount } = mapBulkRpcRows((data ?? []) as BulkFilteredRpcRow[]);
    const validEntries = entries.filter((entry) => isValidBulkPhone(entry.phone));

    return {
      entries: validEntries,
      count: validEntries.length,
      totalCount,
    };
  },

  /**
   * Fetch all directory entries matching bulk filters (for "select all filtered").
   */
  async fetchAllEntriesForBulk(
    filters?: Omit<DirectoryBulkFilters, 'limit' | 'page'>,
    options?: { pageSize?: number; maxPages?: number; maxEntries?: number },
  ): Promise<DirectoryEntry[]> {
    const pageSize = options?.pageSize ?? 500;
    const maxPages = options?.maxPages ?? 200;
    const maxEntries = options?.maxEntries ?? 10_000;
    const seen = new Set<string>();
    const results: DirectoryEntry[] = [];

    for (let page = 0; page < maxPages; page++) {
      const result = await this.getEntriesForBulk({
        ...filters,
        limit: pageSize,
        page,
        sortField: filters?.sortField ?? BULK_DIRECTORY_DEFAULT_SORT_FIELD,
        sortDirection: filters?.sortDirection ?? BULK_DIRECTORY_DEFAULT_SORT_DIRECTION,
      });

      for (const entry of result.entries) {
        if (!entry.phone || seen.has(entry.id)) continue;
        seen.add(entry.id);
        results.push(entry);
        if (results.length >= maxEntries) return results;
      }

      if (result.entries.length < pageSize) break;
    }

    return results;
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
