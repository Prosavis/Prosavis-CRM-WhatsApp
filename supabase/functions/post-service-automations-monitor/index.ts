import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireDirectoryAdmin } from "../_shared/directoryMonitorAuth.ts";
import { formatError } from "../_shared/errors.ts";
import type { PostServiceFollowUpPayload } from "../_shared/postServiceAutomation.ts";
import {
  buildPostServiceDashboard,
  fetchPostServiceHistory,
  hasSentPostServiceEvent,
  loadLatestPendingPostServicePayload,
  loadPendingPostServicePayloadByAppointmentId,
  loadPostServiceRetryPayload,
  setPostServicePreference,
} from "../_shared/postServiceDashboard.ts";

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function configuredPostServiceApiKey(): string | null {
  return (
    Deno.env.get("POST_SERVICE_API_KEY")?.trim() ||
    Deno.env.get("REMINDER_API_KEY")?.trim() ||
    Deno.env.get("SUPABASE_CRM_WRITE_KEY")?.trim() ||
    null
  );
}

function readAppointmentPayload(
  body: Record<string, unknown>,
): PostServiceFollowUpPayload | null {
  const candidate = body.appointmentPayload ?? body.appointment ?? body.payload;
  if (!candidate || typeof candidate !== "object") return null;
  return candidate as PostServiceFollowUpPayload;
}

function appointmentIdFromPayload(
  payload: PostServiceFollowUpPayload | null,
): string {
  return payload?.appointmentData?.appointmentId?.trim() ?? "";
}

async function invokePostServiceSender(
  payload: PostServiceFollowUpPayload,
  options: { dryRun: boolean; runKind: "retry" | "dry_run" },
): Promise<Response> {
  const apiKey = configuredPostServiceApiKey();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim().replace(/\/+$/, "");
  if (!apiKey || !supabaseUrl) {
    return jsonResponse({
      error: "Faltan POST_SERVICE_API_KEY/REMINDER_API_KEY o SUPABASE_URL.",
    }, 503);
  }

  let response: Response;
  try {
    response = await fetch(
      `${supabaseUrl}/functions/v1/send-post-service-followup`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          ...payload,
          dryRun: options.dryRun,
          runKind: options.runKind,
          schedulerName: "post-service-automations-monitor",
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch (error) {
    return jsonResponse({
      success: false,
      error: `network: ${formatError(error)}`,
    }, 502);
  }

  const result = await response.json().catch(() => ({
    success: false,
    error: `Respuesta no JSON (HTTP ${response.status}).`,
  }));
  return jsonResponse(result, response.status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = req.method === "GET"
      ? { action: "dashboard" }
      : await req.json().catch(() => ({ action: "dashboard" })) as Record<
        string,
        unknown
      >;
    const action = String(body.action ?? "dashboard").trim();
    const { supabase, actor } = await requireDirectoryAdmin(req);

    if (req.method === "GET" || action === "dashboard") {
      return jsonResponse(await buildPostServiceDashboard(supabase));
    }

    if (action === "history") {
      const dateFrom = String(body.dateFrom ?? "").trim();
      const dateTo = String(body.dateTo ?? "").trim();
      if (!isDateKey(dateFrom) || !isDateKey(dateTo)) {
        return jsonResponse({
          error: "dateFrom y dateTo requeridos (YYYY-MM-DD).",
        }, 400);
      }
      if (dateFrom > dateTo) {
        return jsonResponse({
          error: "dateFrom no puede ser posterior a dateTo.",
        }, 400);
      }
      return jsonResponse(
        await fetchPostServiceHistory(supabase, { dateFrom, dateTo }),
      );
    }

    if (action === "runDry") {
      let payload = readAppointmentPayload(body);
      if (!payload) {
        payload = await loadLatestPendingPostServicePayload(supabase);
      }
      if (!appointmentIdFromPayload(payload)) {
        return jsonResponse({
          error: "No hay una cita COMPLETED pendiente disponible para simular.",
        }, 404);
      }
      return await invokePostServiceSender(payload!, {
        dryRun: true,
        runKind: "dry_run",
      });
    }

    if (action === "retry") {
      const eventId = String(body.eventId ?? "").trim();
      const requestedAppointmentId = String(body.appointmentId ?? "").trim();
      let payload = readAppointmentPayload(body);
      if (!payload && (eventId || requestedAppointmentId)) {
        payload = await loadPostServiceRetryPayload(supabase, {
          eventId: eventId || undefined,
          appointmentId: requestedAppointmentId || undefined,
        });
      }
      if (!payload && requestedAppointmentId) {
        payload = await loadPendingPostServicePayloadByAppointmentId(
          supabase,
          requestedAppointmentId,
        );
      }

      const appointmentId = appointmentIdFromPayload(payload) ||
        requestedAppointmentId;
      if (!payload || !appointmentId) {
        return jsonResponse({
          error:
            "retry requiere eventId, appointmentId con evento fallido o appointmentPayload.",
        }, 400);
      }
      if (await hasSentPostServiceEvent(supabase, appointmentId)) {
        return jsonResponse({
          error: "El seguimiento post-servicio ya fue enviado.",
        }, 409);
      }

      return await invokePostServiceSender(payload, {
        dryRun: false,
        runKind: "retry",
      });
    }

    if (action === "setRecipientPreference") {
      const directoryId = String(body.directoryId ?? "").trim();
      if (!directoryId) {
        return jsonResponse({ error: "directoryId es requerido." }, 400);
      }
      const postServiceEnabled = typeof body.postServiceEnabled === "boolean"
        ? body.postServiceEnabled
        : body.enabled;
      if (typeof postServiceEnabled !== "boolean") {
        return jsonResponse({
          error: "postServiceEnabled boolean es requerido.",
        }, 400);
      }
      const updatedBy = actor.kind === "supabase" ? actor.uid : null;
      await setPostServicePreference(supabase, {
        directoryId,
        postServiceEnabled,
        updatedBy,
        notes: typeof body.notes === "string"
          ? body.notes.trim() || null
          : null,
      });
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `Acción no soportada: ${action}` }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
