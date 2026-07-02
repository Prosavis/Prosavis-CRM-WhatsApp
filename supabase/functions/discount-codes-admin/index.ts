/**
 * discount-codes-admin
 *
 * Gateway CRM para gestionar códigos de descuento en Firestore `discount_codes`.
 * El CRM autentica con Supabase Auth; las operaciones privilegiadas a Firestore
 * usan FIREBASE_SERVICE_ACCOUNT_JSON (mismo patrón que update-app-user-profile).
 */

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  createDiscountCode,
  deleteDiscountCode,
  DiscountCodesError,
  discountCodesErrorStatus,
  listDiscountCodes,
  permanentDeleteDiscountCode,
  updateDiscountCode,
} from '../_shared/discountCodesAdmin.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { profile } = await requireCrmAdmin(req);
    const actorId = profile.id;

    const body = req.method === 'GET'
      ? {}
      : await req.json().catch(() => ({}));

    const action = String(body.action ?? 'list').trim();

    switch (action) {
      case 'list': {
        const result = await listDiscountCodes({
          status: typeof body.status === 'string' ? body.status : undefined,
          limit: typeof body.limit === 'number' ? body.limit : undefined,
        });
        return jsonResponse(result);
      }

      case 'create': {
        const result = await createDiscountCode(actorId, {
          code: body.code,
          discountType: body.discountType,
          discountAmountCOP: body.discountAmountCOP,
          discountPercent: body.discountPercent,
          maxRedemptions: body.maxRedemptions,
          singleUse: body.singleUse,
          description: body.description,
        });
        return jsonResponse(result);
      }

      case 'update': {
        const result = await updateDiscountCode(actorId, {
          id: body.id,
          code: body.code,
          discountType: body.discountType,
          discountAmountCOP: body.discountAmountCOP,
          discountPercent: body.discountPercent,
          maxRedemptions: body.maxRedemptions,
          description: body.description,
          status: body.status,
        });
        return jsonResponse(result);
      }

      case 'delete': {
        const result = await deleteDiscountCode(actorId, String(body.id ?? ''));
        return jsonResponse(result);
      }

      case 'permanentDelete': {
        const result = await permanentDeleteDiscountCode(actorId, String(body.id ?? ''));
        return jsonResponse(result);
      }

      default:
        return jsonResponse({ error: `Acción no soportada: ${action}` }, 400);
    }
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof DiscountCodesError) {
      return jsonResponse({ error: error.message, code: error.code }, discountCodesErrorStatus(error));
    }
    console.error('discount-codes-admin error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
