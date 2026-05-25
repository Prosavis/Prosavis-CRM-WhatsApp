import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

interface MessageLogRow {
  direction: 'inbound' | 'outbound';
  status: string;
  campaign_type: string | null;
  created_at: string;
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
      .select('direction,status,campaign_type,created_at')
      .eq('hidden_from_panel', false)
      .gte('created_at', from.toISOString());

    if (body.phoneNumberId) {
      query = query.eq('phone_number_id', body.phoneNumberId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as MessageLogRow[];
    const outbound = rows.filter((row) => row.direction === 'outbound');
    const inbound = rows.filter((row) => row.direction === 'inbound');
    const byCampaign: Record<string, {
      sent: number;
      delivered: number;
      read: number;
      failed: number;
      outboundOk: number;
    }> = {};

    for (const row of outbound) {
      const key = row.campaign_type || 'OTHER';
      byCampaign[key] ??= {
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        outboundOk: 0,
      };

      if (row.status === 'failed') byCampaign[key].failed += 1;
      if (row.status === 'read') byCampaign[key].read += 1;
      if (row.status === 'delivered') byCampaign[key].delivered += 1;
      if (['sent', 'delivered', 'read'].includes(row.status)) {
        byCampaign[key].sent += 1;
        byCampaign[key].outboundOk += 1;
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

    return jsonResponse({
      period: { from: from.toISOString(), to: new Date().toISOString() },
      totalSent,
      totalDelivered,
      totalRead,
      reachedDevice,
      totalFailed,
      totalResponses,
      responseRate: totalSent > 0 ? totalResponses / totalSent : 0,
      optOutCount: 0,
      byCampaign,
      leads: {
        total: 0,
        enSeguimiento: 0,
        enRebooking: 0,
        optOut: 0,
        agendados: 0,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: String(error) }, 500);
  }
});
