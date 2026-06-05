/**
 * @deprecated Use `directoryService` instead (`@/services/directoryService`).
 * This file will be removed in a future release. All new code should use
 * the `crm_directory` table via `directoryService`.
 */
import type { Lead, LeadSequenceType, DirectoryChannel } from '@/types/lead';
import type { DirectoryEntry } from '@/types/lead';
import { directoryService } from './directoryService';

// Map a DirectoryEntry → Lead (backward-compatible shape)
function directoryEntryToLead(entry: DirectoryEntry): Lead {
  return {
    ...entry,
    name: entry.fullName,
    userId: entry.appUserId,
    fecha_primer_contacto: entry.firstContactAt
      ? new Date(entry.firstContactAt)
      : undefined,
    fecha_ultimo_mensaje_enviado: entry.lastContactAt
      ? new Date(entry.lastContactAt)
      : undefined,
    mensajes_enviados: entry.messagesCount,
    secuencia_activa: (entry.activeSequence ?? 'NINGUNA') as LeadSequenceType,
    secuencia_paso: entry.sequenceStep,
    opt_out: entry.optOut,
    last_response_text: entry.lastResponseText ?? undefined,
    last_response_at: entry.lastResponseAt ? new Date(entry.lastResponseAt) : undefined,
  } as unknown as Lead;
}

// Map a Partial<Lead> → Partial<DirectoryEntry> for creating/updating
function leadToDirectoryData(data: Partial<Lead>): Partial<DirectoryEntry> {
  const legacy = data as unknown as Record<string, unknown>;
  const entry: Partial<DirectoryEntry> = {};
  if (legacy.phone !== undefined) entry.phone = legacy.phone as string;
  if (legacy.email !== undefined) entry.email = legacy.email as string;
  if (legacy.name !== undefined) entry.fullName = legacy.name as string;
  if (legacy.address !== undefined) entry.address = legacy.address as string;
  if (legacy.notes !== undefined) entry.notes = legacy.notes as string;
  if (legacy.userId !== undefined) entry.appUserId = legacy.userId as string;
  if (legacy.channels !== undefined) entry.channels = legacy.channels as DirectoryChannel[];
  if (legacy.status !== undefined) entry.status = legacy.status as string;
  if (legacy.source !== undefined) entry.source = legacy.source as string;
  if (legacy.secuencia_activa !== undefined) entry.activeSequence = legacy.secuencia_activa as string;
  if (legacy.secuencia_paso !== undefined) entry.sequenceStep = legacy.secuencia_paso as number;
  if (legacy.opt_out !== undefined) entry.optOut = legacy.opt_out as boolean;
  if (legacy.mensajes_enviados !== undefined) entry.messagesCount = legacy.mensajes_enviados as number;
  if (legacy.last_response_text !== undefined) entry.lastResponseText = legacy.last_response_text as string;
  if (legacy.appointmentId !== undefined) entry.appointmentId = legacy.appointmentId as string;
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
      leads = leads.filter((l) => (l as unknown as Record<string, unknown>).secuencia_activa === filters.secuencia_activa);
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
