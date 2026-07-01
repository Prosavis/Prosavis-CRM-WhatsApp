/**
 * Resolución unificada de teléfonos para monitor de recordatorios.
 * Cadena alineada con reminderPhoneResolver.ts (Firebase).
 */

import { getFirestoreUserPhone } from './firebaseAdminRest.ts';
import { normalizeDirectoryPhoneE164 } from './directoryPhone.ts';

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

const SENTINEL_CLIENT_IDS = new Set(['manual-appointment', 'web-client']);

interface DirectoryRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  app_user_id: string | null;
  service_id: string | null;
  metadata: Record<string, unknown> | null;
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñ]/g, '')
    .trim();
}

function isSentinelClientId(id: string | null | undefined): boolean {
  if (!id) return true;
  return SENTINEL_CLIENT_IDS.has(id.trim());
}

function pickPhone(row: DirectoryRow | null | undefined): string | null {
  const raw = row?.phone?.trim();
  if (!raw) return null;
  return normalizeDirectoryPhoneE164(raw) ?? raw;
}

function firebaseDocIdFromMetadata(metadata: Record<string, unknown> | null): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const direct = metadata.firebase_crmClient_docId;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const sourceIds = metadata.source_ids;
  if (sourceIds && typeof sourceIds === 'object') {
    const nested = (sourceIds as Record<string, unknown>).firebase_crmClient_docId;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  return null;
}

async function getDirectoryById(
  supabase: SupabaseClient,
  id: string,
): Promise<DirectoryRow | null> {
  const { data, error } = await supabase
    .from('crm_directory')
    .select('id, full_name, phone, app_user_id, service_id, metadata')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as DirectoryRow | null;
}

async function getDirectoryByAppUserId(
  supabase: SupabaseClient,
  appUserId: string,
): Promise<DirectoryRow | null> {
  const { data, error } = await supabase
    .from('crm_directory')
    .select('id, full_name, phone, app_user_id, service_id, metadata')
    .eq('app_user_id', appUserId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as DirectoryRow | null;
}

async function getDirectoryByFirestoreDocId(
  supabase: SupabaseClient,
  docId: string,
): Promise<DirectoryRow | null> {
  const { data, error } = await supabase
    .from('crm_directory')
    .select('id, full_name, phone, app_user_id, service_id, metadata')
    .contains('metadata', { source_ids: { firebase_crmClient_docId: docId } })
    .limit(1)
    .maybeSingle();
  if (error) {
    const { data: fallback, error: fallbackError } = await supabase
      .from('crm_directory')
      .select('id, full_name, phone, app_user_id, service_id, metadata')
      .filter('metadata->source_ids->>firebase_crmClient_docId', 'eq', docId)
      .limit(1)
      .maybeSingle();
    if (fallbackError) throw fallbackError;
    return fallback as DirectoryRow | null;
  }
  return data as DirectoryRow | null;
}

async function getDirectoryByPhoneFromClientId(
  supabase: SupabaseClient,
  clientId: string,
): Promise<DirectoryRow | null> {
  const phoneMatch = clientId.match(/^(?:web|mob)_(\d{7,})$/);
  if (!phoneMatch) return null;
  const digits = phoneMatch[1];
  const { data, error } = await supabase
    .from('crm_directory')
    .select('id, full_name, phone, app_user_id, service_id, metadata')
    .or(`phone.ilike.%${digits}%,phone_key.eq.${digits.slice(-10)}`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as DirectoryRow | null;
}

async function resolveDirectoryEntry(
  supabase: SupabaseClient,
  clientId: string,
): Promise<DirectoryRow | null> {
  const trimmed = clientId.trim();
  if (!trimmed) return null;

  let entry = await getDirectoryByAppUserId(supabase, trimmed);
  if (entry) return entry;

  entry = await getDirectoryByFirestoreDocId(supabase, trimmed);
  if (entry) return entry;

  entry = await getDirectoryById(supabase, trimmed);
  if (entry) return entry;

  entry = await getDirectoryByPhoneFromClientId(supabase, trimmed);
  return entry;
}

async function findDirectoryByNormalizedName(
  supabase: SupabaseClient,
  clientName: string,
  serviceId: string | null,
): Promise<DirectoryRow | null> {
  const normalized = normalizeName(clientName);
  if (!normalized) return null;

  let query = supabase
    .from('crm_directory')
    .select('id, full_name, phone, app_user_id, service_id, metadata')
    .not('phone', 'is', null);

  if (serviceId) {
    query = query.eq('service_id', serviceId);
  }

  const { data, error } = await query.limit(50);
  if (error) throw error;

  for (const row of (data ?? []) as DirectoryRow[]) {
    const name = row.full_name ?? '';
    if (normalizeName(name) === normalized) return row;
  }
  return null;
}

export async function resolveClientPhoneForAppointment(
  supabase: SupabaseClient,
  data: Record<string, unknown>,
): Promise<string | null> {
  const direct = String(data.clientPhone ?? '').trim();
  if (direct) return direct;

  const clientId = String(data.clientId ?? '').trim();
  const serviceId = String(data.serviceId ?? '').trim() || null;
  const clientName = String(data.clientName ?? '').trim();

  if (clientId && !isSentinelClientId(clientId)) {
    const entry = await resolveDirectoryEntry(supabase, clientId);
    const phone = pickPhone(entry);
    if (phone) return phone;
  }

  if (clientName) {
    const entry = await findDirectoryByNormalizedName(supabase, clientName, serviceId);
    const phone = pickPhone(entry);
    if (phone) return phone;
  }

  const uids = [data.clientAppUserId, data.clientId]
    .map((v) => String(v ?? '').trim())
    .filter((uid) => uid.length > 0 && !isSentinelClientId(uid));

  for (const uid of uids) {
    const phone = await getFirestoreUserPhone(uid);
    if (phone) return phone;
  }

  return null;
}

export async function resolveProfessionalPhoneForAppointment(
  data: Record<string, unknown>,
): Promise<{ phone: string | null; missingProfessional: boolean }> {
  const uid = String(data.teamMemberId ?? data.providerId ?? '').trim();
  if (!uid) return { phone: null, missingProfessional: true };
  const phone = await getFirestoreUserPhone(uid);
  return { phone, missingProfessional: false };
}
