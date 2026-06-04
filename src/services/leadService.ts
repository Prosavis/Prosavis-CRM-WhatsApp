import { supabase } from '@/config/supabase';
import type { Lead, LeadSource, LeadStatus } from '@/types/lead';

type LeadRow = {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  address: string | null;
  notes: string | null;
  user_id: string | null;
  channels: string[] | null;
  status: LeadStatus;
  source: LeadSource;
  fecha_primer_contacto: string | null;
  fecha_ultimo_mensaje_enviado: string | null;
  mensajes_enviados: number;
  secuencia_activa: string;
  secuencia_paso: number;
  opt_out: boolean;
  last_response_text: string | null;
  last_response_at: string | null;
  appointment_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapLead(row: LeadRow): Lead {
  return {
    id: row.id,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    name: row.name ?? undefined,
    address: row.address ?? undefined,
    notes: row.notes ?? undefined,
    userId: row.user_id ?? undefined,
    channels: (row.channels ?? []) as Lead['channels'],
    status: row.status,
    source: row.source,
    fecha_primer_contacto: row.fecha_primer_contacto
      ? new Date(row.fecha_primer_contacto)
      : undefined,
    fecha_ultimo_mensaje_enviado: row.fecha_ultimo_mensaje_enviado
      ? new Date(row.fecha_ultimo_mensaje_enviado)
      : undefined,
    mensajes_enviados: row.mensajes_enviados,
    secuencia_activa: row.secuencia_activa as Lead['secuencia_activa'],
    secuencia_paso: row.secuencia_paso,
    opt_out: row.opt_out,
    last_response_text: row.last_response_text ?? undefined,
    last_response_at: row.last_response_at ? new Date(row.last_response_at) : undefined,
    appointmentId: row.appointment_id ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toDbLead(data: Partial<Lead>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (data.phone !== undefined) row.phone = data.phone;
  if (data.email !== undefined) row.email = data.email;
  if (data.name !== undefined) row.name = data.name;
  if (data.address !== undefined) row.address = data.address;
  if (data.notes !== undefined) row.notes = data.notes;
  if (data.userId !== undefined) row.user_id = data.userId;
  if (data.channels !== undefined) row.channels = data.channels;
  if (data.status !== undefined) row.status = data.status;
  if (data.source !== undefined) row.source = data.source;
  if (data.secuencia_activa !== undefined) row.secuencia_activa = data.secuencia_activa;
  if (data.secuencia_paso !== undefined) row.secuencia_paso = data.secuencia_paso;
  if (data.opt_out !== undefined) row.opt_out = data.opt_out;
  if (data.mensajes_enviados !== undefined) row.mensajes_enviados = data.mensajes_enviados;
  if (data.last_response_text !== undefined) row.last_response_text = data.last_response_text;
  if (data.appointmentId !== undefined) row.appointment_id = data.appointmentId;
  return row;
}

export const leadService = {
  async createLead(data: Partial<Lead>) {
    const { data: row, error } = await supabase
      .from('crm_leads')
      .insert(toDbLead(data))
      .select('id')
      .single();
    if (error) throw error;
    return { id: row.id as string, success: true };
  },

  async updateLead(leadId: string, data: Partial<Lead>) {
    const { error } = await supabase
      .from('crm_leads')
      .update(toDbLead(data))
      .eq('id', leadId);
    if (error) throw error;
    return { success: true };
  },

  async fetchAllPhonesForBulk(options?: { pageSize?: number; maxPages?: number }) {
    const pageSize = options?.pageSize ?? 500;
    const maxPages = options?.maxPages ?? 200;
    const phones = new Set<string>();
    for (let page = 0; page < maxPages; page++) {
      const result = await this.getLeads({
        limit: pageSize,
        page,
        sortField: 'created_at',
        sortDirection: 'desc',
      });
      for (const lead of result.leads) {
        if (!lead.phone) continue;
        const digits = lead.phone.replace(/\D/g, '');
        if (digits.length >= 10 && digits.length <= 15) phones.add(digits);
      }
      if (result.leads.length < pageSize) break;
    }
    return [...phones];
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
    const limit = filters?.limit ?? 25;
    const page = filters?.page ?? 0;
    const from = page * limit;
    const to = from + limit - 1;
    const sortField = filters?.sortField ?? 'created_at';
    const ascending = filters?.sortDirection === 'asc';

    let query = supabase.from('crm_leads').select('*', { count: 'exact' });
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.source) query = query.eq('source', filters.source);
    if (filters?.secuencia_activa) query = query.eq('secuencia_activa', filters.secuencia_activa);
    if (typeof filters?.opt_out === 'boolean') query = query.eq('opt_out', filters.opt_out);
    if (filters?.searchTerm?.trim()) {
      const term = `%${filters.searchTerm.trim()}%`;
      query = query.or(`name.ilike.${term},phone.ilike.${term},email.ilike.${term}`);
    }
    query = query.order(sortField, { ascending }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    const leads = (data ?? []).map((row) => mapLead(row as LeadRow));
    return {
      leads,
      count: leads.length,
      totalCount: count ?? leads.length,
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
    const { data, error } = await supabase.from('crm_leads').select('status,opt_out').limit(10000);
    if (error) throw error;
    const rows = data ?? [];
    const total = rows.length;
    const pendientes = rows.filter((r) => r.status === 'PENDIENTE').length;
    const noAgendo = rows.filter((r) => r.status === 'NO_AGENDO').length;
    const agendados = rows.filter((r) => r.status === 'AGENDADO').length;
    const completados = rows.filter((r) => r.status === 'COMPLETADO').length;
    const optOut = rows.filter((r) => r.opt_out === true).length;
    const pagoRechazado = rows.filter((r) => r.status === 'PAGO_RECHAZADO').length;
    return { total, pendientes, noAgendo, agendados, completados, optOut, pagoRechazado };
  },
};
