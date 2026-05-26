import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import {
  getStaticCleaningWompiReference,
  getStaticCleaningWompiUrl,
} from '../_shared/wompiLinks.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const amountCOP = Number(body.amountCOP);
    if (!Number.isFinite(amountCOP) || amountCOP <= 0) {
      return jsonResponse({ error: 'amountCOP inválido.' }, 400);
    }

    const rounded = Math.round(amountCOP);
    const url = getStaticCleaningWompiUrl(rounded);
    if (!url) {
      return jsonResponse({ error: 'No hay link Wompi para ese monto.' }, 404);
    }

    return jsonResponse({
      url,
      reference: getStaticCleaningWompiReference(rounded),
      amountInCents: rounded * 100,
      amountCOP: rounded,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
