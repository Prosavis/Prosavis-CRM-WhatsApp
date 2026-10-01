import { requireAdmin } from '../_shared/adminAuth.ts';
import {
  strictJsonResponse,
  strictPreflightResponse,
} from '../_shared/strictCors.ts';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return strictPreflightResponse(req);

  try {
    const { supabase } = await requireAdmin(req);
    const { data, error } = await supabase.rpc('whatsapp_delivery_cost_month');
    if (error) throw error;
    return strictJsonResponse(req, data ?? { incomplete: true, estimateCop: null, lines: [] });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = errorMessage(error);
    console.error('get-whatsapp-delivery-cost failed', message, error);
    return strictJsonResponse(req, { error: message }, 500);
  }
});
