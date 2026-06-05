/**
 * @deprecated Use `directoryService` instead (`@/services/directoryService`).
 * This file will be removed in a future release. All new code should use
 * the `crm_directory` table via `directoryService`.
 */
import type { Lead, LeadSource, LeadStatus } from '@/types/lead';
import type { DirectoryEntry } from '@/types/lead';
import { directoryService } from './directoryService';

// Map a DirectoryEntry → Lead (backward-compatible shape)
function directoryEntryToLead(entry: DirectoryEntry): Lead {
  return {
    id: entry.id,
    phone: entry.phone ?? undefined,
    email: entry.email ?? undefined,
    name: entry.fullName ?? undefined,
    address: entry.address ?? undefined,
    notes: entry.notes ?? undefined,
    userId: entry.appUserId ?? undefined,
    channels: (entry.channels ?? []) as Lead['channels'],
    status: entry.status as LeadStatus,
    source: (entry.source ?? 'direct') as LeadSource,
    fecha_primer_contacto: entry.firstContactAt
      ? new Date(entry.firstContactAt)
      : undefined,
    fecha_ultimo_mensaje_enviado: entry.lastContactAt
      ? new Date(entry.lastContactAt)
      : undefined,
    mensajes_enviados: entry.messagesCount,
    secuencia_activa: (entry.activeSequence ?? 'NINGUNA') as Lead['secuencia_activa'],
    secuencia_paso: entry.sequenceStep,
    opt_out: entry.optOut,
    last_response_text: entry.lastResponseText ?? undefined,
    last_response_at: entry.lastResponseAt ? new Date(entry.lastResponseAt) : undefined,
    appointmentId: entry.appointmentId ?? undefined,
    createdAt: new Date(entry.createdAt),
    updatedAt: new Date(entry.updatedAt),
  };
}

// Map a Partial<Lead> → Partial<DirectoryEntry> for creating/updating
function leadToDirectoryData(data: Partial<Lead>): Partial<DirectoryEntry> {
  const entry: Partial<DirectoryEntry> = {};
  if (data.phone !== undefined) entry.phone = data.phone;
  if (data.email !== undefined) entry.email = data.email;
  if (data.name !== undefined) entry.fullName = data.name;
  if (data.address !== undefined) entry.address = data.address;
  if (data.notes !== undefined) entry.notes = data.notes;
  if (data.userId !== undefined) entry.appUserId = data.userId;
  if (data.channels !== undefined) entry.channels = data.channels;
  if (data.status !== undefined) entry.status = data.status;
  if (data.source !== undefined) entry.source = data.source;
  if (data.secuencia_activa !== undefined) entry.activeSequence = data.secuencia_activa;
  if (data.secuencia_paso !== undefined) entry.sequenceStep = data.secuencia_paso;
  if (data.opt_out !== undefined) entry.optOut = data.opt_out;
  if (data.mensajes_enviados !== undefined) entry.messagesCount = data.mensajes_enviados;
  if (data.last_response_text !== undefined) entry.lastResponseText = data.last_response_text;
  if (data.appointmentId !== undefined) entry.appointmentId = data.appointmentId;
  return entry;
}

export const leadService = {
  async createLead(data: Partial<Lead>) {
    return directoryService.createEntry(leadToDirectoryData(data));
  },

  async updateLead(leadId: string, data: Partial<Lead>) {
    return directoryService.updateEntry(leadId, leadToDirectoryData(data));
  },

  async fetchAllPhonesForBulk(options?: { pageSize?: number; maxPages?: number }) {
    return directoryService.fetchAllPhonesForBulk(options);
  },

  async getLeads(filters?: {
    status?: string;
    source?: string;
    secuencia_activa?: string;
    opt_out?: boolean;
    limit?: number;
    page?: number;
    searchTerm?: string;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
  }) {
    // Map legacy filter names to directoryService filter names
    const dirFilters: Parameters<typeof directoryService.getEntries>[0] = {};
    if (filters?.status) dirFilters.status = filters.status;
    if (filters?.source) dirFilters.source = filters.source;
    if (typeof filters?.opt_out === 'boolean') dirFilters.optOut = filters.opt_out;
    if (filters?.limit !== undefined) dirFilters.limit = filters.limit;
    if (filters?.page !== undefined) dirFilters.page = filters.page;
    if (filters?.searchTerm !== undefined) dirFilters.searchTerm = filters.searchTerm;
    if (filters?.sortField !== undefined) dirFilters.sortField = filters.sortField;
    if (filters?.sortDirection !== undefined) dirFilters.sortDirection = filters.sortDirection;

    const result = await directoryService.getEntries(dirFilters);
    let leads = result.entries.map(directoryEntryToLead);

    // In-memory filter for active_sequence (directoryService does not expose this filter directly)
    if (filters?.secuencia_activa) {
      leads = leads.filter((l) => l.secuencia_activa === filters.secuencia_activa);
    }

    return {
      leads,
      count: leads.length,
      totalCount: result.totalCount,
      lastDocId: leads.at(-1)?.id ?? null,
    };
  },

  async convertUsersToLeads(_userIds: string[]) {
    void _userIds;
    return { created: 0, skipped: 0, errors: 0 };
  },

  async seedAllUsersAsLeads() {
    return { created: 0, skipped: 0, errors: 0 };
  },

  async getLeadStats() {
    const stats = await directoryService.getStats();
    // Map directory classifications back to legacy status-based stats:
    // crm_leads.status → crm_directory.classification (byClassification map)
    return {
      total: stats.total,
      pendientes: stats.byClassification['PENDIENTE'] ?? 0,
      noAgendo: stats.byClassification['NO_AGENDO'] ?? 0,
      agendados: stats.byClassification['AGENDADO'] ?? 0,
      completados: stats.byClassification['COMPLETADO'] ?? 0,
      optOut: stats.optOut,
      pagoRechazado: stats.byClassification['PAGO_RECHAZADO'] ?? 0,
    };
  },
};
