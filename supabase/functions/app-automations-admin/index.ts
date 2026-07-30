/**
 * app-automations-admin
 *
 * Gateway CRM para gestionar reglas de app (chat/push/tareas) en Firestore
 * services/{Prosavis Limpieza}/automations. Auth: Supabase admin_profiles.
 */

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  AppAutomationsError,
  appAutomationsErrorStatus,
  createAppAutomation,
  deleteAppAutomation,
  listAppAutomations,
  toggleAppAutomation,
  updateAppAutomation,
} from '../_shared/appAutomationsAdmin.ts';
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
        const rules = await listAppAutomations();
        return jsonResponse({ rules });
      }

      case 'create': {
        const ruleAction =
          body.ruleAction && typeof body.ruleAction === 'object'
            ? body.ruleAction
            : null;
        if (!ruleAction) {
          return jsonResponse(
            { error: 'ruleAction es obligatorio (objeto { type }).' },
            400,
          );
        }
        const rule = await createAppAutomation(actorId, {
          name: body.name,
          trigger: body.trigger,
          delay: body.delay,
          action: ruleAction,
          actionConfig: body.actionConfig,
        });
        return jsonResponse({ rule });
      }

      case 'update': {
        const ruleAction =
          body.ruleAction && typeof body.ruleAction === 'object'
            ? body.ruleAction
            : undefined;
        const rule = await updateAppAutomation(String(body.ruleId ?? body.id ?? ''), {
          name: body.name,
          isActive: body.isActive,
          trigger: body.trigger,
          delay: body.delay,
          action: ruleAction,
          actionConfig: body.actionConfig,
        });
        return jsonResponse({ rule });
      }

      case 'toggle': {
        const rule = await toggleAppAutomation(
          String(body.ruleId ?? body.id ?? ''),
          body.isActive === true,
        );
        return jsonResponse({ rule });
      }

      case 'delete': {
        const result = await deleteAppAutomation(String(body.ruleId ?? body.id ?? ''));
        return jsonResponse(result);
      }

      default:
        return jsonResponse({ error: `Acción no soportada: ${action}` }, 400);
    }
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof AppAutomationsError) {
      return jsonResponse(
        { error: error.message, code: error.code },
        appAutomationsErrorStatus(error),
      );
    }
    console.error('app-automations-admin error:', error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
});
