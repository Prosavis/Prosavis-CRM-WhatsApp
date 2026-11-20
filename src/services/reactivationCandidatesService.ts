import { supabase } from '@/config/supabase';

export interface ReactivationCandidate {
  phone_key: string;
  dial_phone: string | null;
  display_name: string | null;
  segment: string;
  priority: string;
  angle: string;
  template_name: string;
  var1: string | null;
  var2: string | null;
  context: string | null;
  eligible: boolean;
  due: boolean;
  sensitive: boolean | null;
  handler: string | null;
  exclusion: string | null;
  done_count: number | null;
  ltv_cop: number | null;
  cadence_days: number | null;
  next_due: string | null;
  last_done: string | null;
  last_312: string | null;
  last_311: string | null;
  unanswered: number | null;
  opt_out: boolean | null;
  phone_needs_review: boolean | null;
}

export const REACTIVATION_SEGMENTS = ['VIP', 'C1', 'R', 'X', 'B', 'Bh', 'L', 'H', 'F', 'E1'] as const;

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('reactivation-candidates', { body });
  if (error) throw new Error(error.message || 'No se pudo consultar la reactivación.');
  if (data == null) throw new Error('La función reactivation-candidates no devolvió datos.');
  return data;
}

export async function listReactivationCandidates(params: {
  segmentos?: string[];
  prioridad?: string;
  limit?: number;
  offset?: number;
  eligibleOnly?: boolean;
}): Promise<ReactivationCandidate[]> {
  const payload = await invoke<{ items?: ReactivationCandidate[] }>({
    action: 'list',
    segmentos: params.segmentos ?? null,
    prioridad: params.prioridad ?? null,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
    eligibleOnly: params.eligibleOnly !== false,
  });
  return payload.items ?? [];
}

export async function holdReactivation(phoneKey: string, reason: string | null): Promise<void> {
  await invoke({ action: 'hold', phoneKey, reason });
}

export async function setReactivationContactType(phoneKey: string, tipo: string): Promise<void> {
  await invoke({ action: 'tipo', phoneKey, tipo });
}
