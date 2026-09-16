import { requireAdmin } from '../_shared/adminAuth.ts';
import {
  strictJsonResponse,
  strictPreflightResponse,
} from '../_shared/strictCors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return strictPreflightResponse(req);

  try {
    const { supabase } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit ?? 100) || 100, 1), 500);
    const cursor = typeof body.cursor === 'string' && body.cursor.trim()
      ? body.cursor.trim()
      : null;
    const historic = body.days === 'all';
    const days = historic ? null : Number(body.days ?? 30);
    const from = new Date();
    if (days != null) from.setDate(from.getDate() - days);

    let query = supabase
      .from('whatsapp_message_log')
      .select('*')
      .eq('hidden_from_panel', false)
      .order('created_at', { ascending: false })
      .limit(limit + 1);
    if (!historic) query = query.gte('created_at', from.toISOString());
    if (cursor) query = query.lt('created_at', cursor);
    if (body.phoneNumberId) query = query.eq('phone_number_id', body.phoneNumberId);
    if (body.status && body.status !== 'all') query = query.eq('status', body.status);
    if (body.search) {
      query = query.or(
        `message_body.ilike.%${body.search}%,recipient_phone.ilike.%${body.search}%`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1] as { created_at?: string } | undefined;
    return strictJsonResponse(req, {
      items,
      nextCursor: hasMore && last?.created_at ? last.created_at : null,
      hasMore,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return strictJsonResponse(req, { error: String(error) }, 500);
  }
});
