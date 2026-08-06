import { requireAdmin } from "../_shared/adminAuth.ts";
import { parseAgendaLostRequest } from "../_shared/agenda/api.ts";
import {
  strictJsonResponse,
  strictPreflightResponse,
} from "../_shared/strictCors.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return strictPreflightResponse(request);
  if (request.method !== "POST") {
    return strictJsonResponse(request, { error: "Método no permitido." }, 405);
  }

  let context;
  try {
    context = await requireAdmin(request);
  } catch (error) {
    if (error instanceof Response) return error;
    return strictJsonResponse(
      request,
      { error: "Usuario no autenticado." },
      401,
    );
  }

  let parsed;
  try {
    parsed = parseAgendaLostRequest(await request.json());
  } catch (error) {
    return strictJsonResponse(
      request,
      { error: error instanceof Error ? error.message : "Solicitud inválida." },
      400,
    );
  }

  const existing = await context.supabase
    .from("lost_requests")
    .select("id,recovery_status,recovered,recovered_booking_id")
    .eq("service_id", parsed.serviceId)
    .eq("request_id", parsed.requestId)
    .maybeSingle();
  if (existing.error) {
    return strictJsonResponse(
      request,
      { error: "No fue posible validar la solicitud perdida." },
      500,
    );
  }
  if (existing.data?.recovered) {
    return strictJsonResponse(request, {
      data: {
        ...existing.data,
        idempotent: true,
      },
    });
  }

  const saved = await context.supabase
    .from("lost_requests")
    .upsert({
      service_id: parsed.serviceId,
      request_id: parsed.requestId,
      requested_tier: parsed.requestedTier,
      requested_date: parsed.requestedDate,
      window_start: parsed.windowStart,
      window_end: parsed.windowEnd,
      comuna: parsed.comuna ?? null,
      reason: parsed.reason,
      alternatives_offered: parsed.alternativesOffered,
      composite_offered: parsed.compositeOffered,
      composite_accepted: parsed.compositeAccepted ?? null,
      recovered: false,
      recovery_status: "unrecovered",
      recovered_booking_id: null,
      recovered_at: null,
    }, {
      onConflict: "service_id,request_id",
    })
    .select("id,recovery_status,recovered,recovered_booking_id")
    .single();
  if (saved.error || !saved.data) {
    console.error("[agenda-perdida] lost request upsert failed", {
      request_id: parsed.requestId,
      spec_version: "v5",
    });
    return strictJsonResponse(
      request,
      { error: "No fue posible registrar la solicitud perdida." },
      500,
    );
  }

  return strictJsonResponse(request, {
    data: {
      ...saved.data,
      idempotent: existing.data !== null,
    },
  }, existing.data ? 200 : 201);
});
