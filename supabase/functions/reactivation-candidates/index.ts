import { requireAdmin } from '../_shared/adminAuth.ts';
import { strictJsonResponse, strictPreflightResponse } from '../_shared/strictCors.ts';

const TIPOS = new Set(['cliente', 'auxiliar', 'empresa', 'posible_cliente']);

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asSegments(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return list.length > 0 ? list : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return strictPreflightResponse(req);
  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const action = asText((body as { action?: unknown }).action) ?? 'list';

    if (action === 'counts') {
      const { data, error } = await supabase.rpc('reactivation_candidate_counts');
      if (error) throw error;
      return strictJsonResponse(req, { action, counts: data ?? [] });
    }

    if (action === 'hold') {
      const phoneKey = asText((body as { phoneKey?: unknown }).phoneKey) ?? '';
      if (!/^[0-9]{10}$/.test(phoneKey)) {
        return strictJsonResponse(req, { error: 'phoneKey de 10 dígitos.' }, 400);
      }
      const reason = asText((body as { reason?: unknown }).reason);
      const { error } = await supabase
        .from('crm_directory')
        .update({ reactivation_hold_reason: reason })
        .eq('phone_key', phoneKey);
      if (error) throw error;
      return strictJsonResponse(req, { action, phoneKey, reason });
    }

    if (action === 'tipo') {
      const phoneKey = asText((body as { phoneKey?: unknown }).phoneKey) ?? '';
      const tipo = asText((body as { tipo?: unknown }).tipo) ?? '';
      if (!/^[0-9]{10}$/.test(phoneKey) || !TIPOS.has(tipo)) {
        return strictJsonResponse(req, { error: 'phoneKey o tipo no válidos.' }, 400);
      }
      const { error } = await supabase
        .from('whatsapp_client_cards')
        .update({ tipo_contacto: tipo })
        .eq('phone', `57${phoneKey}`);
      if (error) throw error;
      return strictJsonResponse(req, { action, phoneKey, tipo });
    }

    const segmentos = asSegments((body as { segmentos?: unknown }).segmentos);
    const prioridad = asText((body as { prioridad?: unknown }).prioridad);
    const limit = Math.min(Math.max(Number((body as { limit?: unknown }).limit ?? 50), 1), 200);
    const offset = Math.max(Number((body as { offset?: unknown }).offset ?? 0), 0);
    const { data, error } = await supabase.rpc('reactivation_candidates', {
      p_segments: segmentos,
      p_priority: prioridad,
      p_eligible_only: (body as { eligibleOnly?: unknown }).eligibleOnly !== false,
      p_limit: limit,
      p_offset: offset,
      p_phone_key: asText((body as { phoneKey?: unknown }).phoneKey),
    });
    if (error) throw error;
    return strictJsonResponse(req, { action: 'list', items: data ?? [] });
  } catch (error) {
    if (error instanceof Response) return error;
    return strictJsonResponse(req, { error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
