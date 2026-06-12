import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

interface MessageLogRow {
  direction: 'inbound' | 'outbound';
  status: string;
  campaign_type: string | null;
  template_name: string | null;
  conversation_stable_key: string | null;
  created_at: string;
}

interface OutboundBucket {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  outboundOk: number;
  total: number;
}

function emptyBucket(): OutboundBucket {
  return { sent: 0, delivered: 0, read: 0, failed: 0, outboundOk: 0, total: 0 };
}

function accumulate(bucket: OutboundBucket, status: string): void {
  bucket.total += 1;
  if (status === 'failed') bucket.failed += 1;
  if (status === 'read') bucket.read += 1;
  if (status === 'delivered') bucket.delivered += 1;
  if (['sent', 'delivered', 'read'].includes(status)) {
    bucket.sent += 1;
    bucket.outboundOk += 1;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const days = Number(body.days ?? 30);
    const from = new Date();
    from.setDate(from.getDate() - days);

    let query = supabase
      .from('whatsapp_message_log')
      .select('direction,status,campaign_type,template_name,conversation_stable_key,created_at')
      .eq('hidden_from_panel', false)
      .gte('created_at', from.toISOString())
      .limit(100000);

    if (body.phoneNumberId) {
      query = query.eq('phone_number_id', body.phoneNumberId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as MessageLogRow[];
    const outbound = rows.filter((row) => row.direction === 'outbound');
    const inbound = rows.filter((row) => row.direction === 'inbound');

    // Agrupado por campaña (campaign_type del log de salida).
    const byCampaign: Record<string, OutboundBucket> = {};
    // Agrupado por plantilla de Meta accionada.
    const byTemplate: Record<string, OutboundBucket> = {};
    // Clasificación por tipo de mensaje: sesión (ventana 24h) vs plantilla/campaña.
    const byKind: { session: OutboundBucket; template: OutboundBucket } = {
      session: emptyBucket(),
      template: emptyBucket(),
    };

    for (const row of outbound) {
      const campaignKey = row.campaign_type || 'OTHER';
      byCampaign[campaignKey] ??= emptyBucket();
      accumulate(byCampaign[campaignKey], row.status);

      const isTemplate = !!row.template_name;
      if (isTemplate) {
        const tplKey = row.template_name as string;
        byTemplate[tplKey] ??= emptyBucket();
        accumulate(byTemplate[tplKey], row.status);
        accumulate(byKind.template, row.status);
      } else {
        accumulate(byKind.session, row.status);
      }
    }

    const totalSent = outbound.filter((row) =>
      ['sent', 'delivered', 'read'].includes(row.status),
    ).length;
    const totalDelivered = outbound.filter((row) => row.status === 'delivered').length;
    const totalRead = outbound.filter((row) => row.status === 'read').length;
    const reachedDevice = outbound.filter((row) =>
      ['delivered', 'read'].includes(row.status),
    ).length;
    const totalFailed = outbound.filter((row) => row.status === 'failed').length;
    const totalResponses = inbound.length;

    // Tasa de respuesta real: contactos únicos que respondieron / contactos únicos
    // a los que se envió (por conversación), expresada en porcentaje 0-100.
    const outboundContacts = new Set(
      outbound
        .filter((row) => ['sent', 'delivered', 'read'].includes(row.status))
        .map((row) => row.conversation_stable_key)
        .filter((key): key is string => !!key),
    );
    const respondedContacts = new Set(
      inbound
        .map((row) => row.conversation_stable_key)
        .filter((key): key is string => !!key),
    );
    let respondedAndContacted = 0;
    for (const key of respondedContacts) {
      if (outboundContacts.has(key)) respondedAndContacted += 1;
    }
    const responseRate =
      outboundContacts.size > 0
        ? Math.round((respondedAndContacted / outboundContacts.size) * 1000) / 10
        : 0;

    const { data: directoryRows } = await supabase
      .from('crm_directory')
      .select('classification,opt_out,active_sequence,pending_appointments_count')
      .limit(10000);
    const entries = directoryRows ?? [];
    const optOutCount = entries.filter((e) => e.opt_out === true).length;

    return jsonResponse({
      period: { from: from.toISOString(), to: new Date().toISOString() },
      totalSent,
      totalDelivered,
      totalRead,
      reachedDevice,
      totalFailed,
      totalResponses,
      responseRate,
      uniqueContactsMessaged: outboundContacts.size,
      uniqueContactsResponded: respondedAndContacted,
      optOutCount,
      byCampaign,
      byTemplate,
      byKind,
      leads: {
        total: entries.length,
        enSeguimiento: entries.filter((e) => e.active_sequence === 'SEGUIMIENTO').length,
        enRebooking: entries.filter((e) => e.active_sequence === 'REBOOKING').length,
        optOut: optOutCount,
        agendados: entries.filter((e) => (e.pending_appointments_count ?? 0) > 0).length,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});
