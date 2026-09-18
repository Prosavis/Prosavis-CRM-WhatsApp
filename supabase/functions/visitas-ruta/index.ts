import { requireAdmin } from "../_shared/adminAuth.ts";
import {
  strictJsonResponse,
  strictPreflightResponse,
} from "../_shared/strictCors.ts";
import { presentVisitPayment } from "../_shared/visitFinance.ts";
import {
  applyDeviceOriginToDraftStops,
  fetchGoogleRouteSeconds,
  isUsableGeoPoint,
  normalizeDraftStops,
  type GeoPoint,
} from "../_shared/visitPrioritization.ts";

const MAX_BODY_BYTES = 16_384;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const BOGOTA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

interface RouteRequest {
  action?: "generate" | "confirm";
  serviceId: string;
  weeklyQuota: number;
  cooldownDays: number;
  idempotencyKey: string;
  routeId?: string;
  start?: { latitude: number; longitude: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredId(
  value: unknown,
  label: string,
  minimumLength = 1,
): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (
    normalized.length < minimumLength ||
    normalized.length > 200 ||
    !ID_PATTERN.test(normalized)
  ) {
    throw new Error(`${label} inválido.`);
  }
  return normalized;
}

function boundedInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${label} inválido.`);
  }
  return value;
}

function parseRouteRequest(value: unknown): RouteRequest {
  if (!isRecord(value)) throw new Error("Body inválido.");
  const action = value.action === "confirm" ? "confirm" : "generate";
  if (action === "confirm") {
    return {
      action,
      serviceId: requiredId(value.serviceId, "Servicio"),
      weeklyQuota: 0,
      cooldownDays: 0,
      idempotencyKey: "confirm-route",
      routeId: typeof value.routeId === "string" ? value.routeId : undefined,
    };
  }
  let start: RouteRequest["start"];
  if (value.start !== undefined && value.start !== null) {
    if (
      !isRecord(value.start) ||
      typeof value.start.latitude !== "number" ||
      typeof value.start.longitude !== "number" ||
      !Number.isFinite(value.start.latitude) ||
      !Number.isFinite(value.start.longitude) ||
      value.start.latitude < -90 ||
      value.start.latitude > 90 ||
      value.start.longitude < -180 ||
      value.start.longitude > 180
    ) {
      throw new Error("Punto inicial inválido.");
    }
    const parsedStart = {
      latitude: value.start.latitude,
      longitude: value.start.longitude,
    };
    if (isUsableGeoPoint(parsedStart)) {
      start = parsedStart;
    }
  }
  return {
    serviceId: requiredId(value.serviceId, "Servicio"),
    weeklyQuota: boundedInteger(value.weeklyQuota, "Cuota semanal", 0, 100),
    cooldownDays: boundedInteger(
      value.cooldownDays ?? 30,
      "Cooldown",
      0,
      365,
    ),
    idempotencyKey: requiredId(
      value.idempotencyKey,
      "Idempotency key",
      8,
    ),
    start,
    action,
  };
}

function geoNotesWithoutStart(value: unknown): Record<string, unknown> {
  const notes = isRecord(value) ? { ...value } : {};
  delete notes.start;
  delete notes.deviceStart;
  delete notes.origin;
  delete notes.latitude;
  delete notes.longitude;
  return notes;
}

async function applyDeviceOriginToGrokDraft(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  route: Record<string, unknown>,
  start: GeoPoint | undefined,
): Promise<Record<string, unknown>> {
  if (!start || !isUsableGeoPoint(start)) return route;
  const stops = normalizeDraftStops(route.stops);
  const points: GeoPoint[] = [
    start,
    ...stops.flatMap((stop) => {
      if (stop.latitude == null || stop.longitude == null) return [];
      const point = { latitude: stop.latitude, longitude: stop.longitude };
      return isUsableGeoPoint(point) ? [point] : [];
    }),
  ];
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY")?.trim() ?? "";
  const travelTimeSeconds = apiKey
    ? await fetchGoogleRouteSeconds(points, apiKey)
    : null;
  const result = applyDeviceOriginToDraftStops({
    stops,
    start,
    travelTimeSeconds: travelTimeSeconds ?? undefined,
  });
  if (!result.originApplied) return route;

  const geoNotes = {
    ...geoNotesWithoutStart(route.geo_notes),
    originApplied: true,
    travelProvider: result.travelProvider,
  };
  const alreadyApplied = isRecord(route.geo_notes) &&
    route.geo_notes.originApplied === true;
  if (!result.changed && alreadyApplied) {
    return {
      ...route,
      stops: result.stops,
      travel_provider: result.travelProvider,
      geo_notes: geoNotes,
    };
  }

  const updated = await supabase
    .from("visit_routes")
    .update({
      stops: result.stops,
      travel_provider: result.travelProvider,
      geo_notes: geoNotes,
    })
    .eq("id", route.id)
    .select("*")
    .single();
  if (updated.error || !updated.data) {
    return {
      ...route,
      stops: result.stops,
      travel_provider: result.travelProvider,
      geo_notes: geoNotes,
    };
  }
  return updated.data as Record<string, unknown>;
}

function bogotaDate(value: Date): string {
  const parts = BOGOTA_DATE_FORMATTER.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function buildDashboardResponse(
  request: Request,
  context: Awaited<ReturnType<typeof requireAdmin>>,
): Promise<Response> {
  let serviceId: string;
  try {
    serviceId = requiredId(
      new URL(request.url).searchParams.get("serviceId"),
      "Servicio",
    );
  } catch (error) {
    return strictJsonResponse(
      request,
      { error: error instanceof Error ? error.message : "Parámetro inválido." },
      400,
    );
  }

  const today = bogotaDate(new Date());
  const [routes, visits, complaints, opportunities, referrals, collections, history, feedback] =
    await Promise.all([
      context.supabase
        .from("visit_routes")
        .select("*")
        .eq("service_id", serviceId)
        .eq("route_date", today)
        .neq("status", "canceled")
        .order("created_at", { ascending: false })
        .limit(1),
      context.supabase
        .from("client_visits")
        .select("*")
        .eq("service_id", serviceId)
        .order("visited_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("quejas")
        .select("*")
        .eq("service_id", serviceId)
        .in("status", ["open", "in_progress"])
        .order("attention_due_on", { ascending: true })
        .order("severity", { ascending: false })
        .limit(50),
      context.supabase
        .from("opportunities")
        .select("*")
        .eq("service_id", serviceId)
        .in("status", ["open", "contacted"])
        .order("next_action_on", { ascending: true, nullsFirst: false })
        .limit(50),
      context.supabase
        .from("referrals")
        .select("*")
        .eq("service_id", serviceId)
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase.rpc("visit_clients_workspace", {
        p_service_id: serviceId,
        p_limit: 100,
        p_offset: 0,
        p_filter: "cobro",
        p_search: null,
      }),
      context.supabase.rpc("visit_history_timeline", {
        p_service_id: serviceId,
        p_limit: 80,
      }),
      context.supabase
        .from("visit_feedback_requests")
        .select(
          "id,directory_id,comment,status,scope,context_snapshot,interpreted_intent,grok_response,created_at",
        )
        .eq("service_id", serviceId)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

  if (
    routes.error ||
    visits.error ||
    complaints.error ||
    opportunities.error ||
    referrals.error
  ) {
    return strictJsonResponse(
      request,
      { error: "No fue posible consultar las visitas." },
      500,
    );
  }
  return strictJsonResponse(request, {
    data: {
      route: routes.data?.[0] ?? null,
      visits: visits.data ?? [],
      complaints: complaints.data ?? [],
      opportunities: opportunities.data ?? [],
      referrals: referrals.data ?? [],
      collections: ((collections.data ?? []) as Array<Record<string, unknown>>).map((row) => {
        const outstanding = Math.max(0, Number(row.outstanding_total_cop ?? 0));
        const presented = presentVisitPayment({
          outstandingTotalCOP: outstanding,
          pendingCount: Number(row.pending_count ?? 0),
          partialCount: Number(row.partial_count ?? 0),
          rejectedCount: Number(row.rejected_count ?? 0),
          headline: typeof row.payment_headline === "string" ? row.payment_headline : null,
        });
        return {
          directoryId: String(row.directory_id ?? ""),
          displayName: String(row.display_name || "Cliente"),
          phone: typeof row.phone === "string" ? row.phone : null,
          outstandingTotalCOP: outstanding,
          paymentStatus: presented.headline,
          paymentHeadlineLabel: presented.headlineLabel,
          pendingAppointmentsCount: Number(row.completed_service_count ?? 0),
        };
      }),
      history: history.data ?? [],
      feedback: feedback.data ?? [],
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return strictPreflightResponse(request);
  if (request.method !== "GET" && request.method !== "POST") {
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

  if (request.method === "GET") {
    return await buildDashboardResponse(request, context);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return strictJsonResponse(
      request,
      { error: "Body demasiado grande." },
      413,
    );
  }

  let input: RouteRequest;
  try {
    input = parseRouteRequest(await request.json());
  } catch (error) {
    return strictJsonResponse(
      request,
      { error: error instanceof Error ? error.message : "Body inválido." },
      400,
    );
  }

  if (input.action === "confirm") {
    const today = bogotaDate(new Date());
    let draftQuery = context.supabase
      .from("visit_routes")
      .select("*")
      .eq("service_id", input.serviceId)
      .eq("route_date", today)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1);
    if (input.routeId) {
      draftQuery = context.supabase
        .from("visit_routes")
        .select("*")
        .eq("service_id", input.serviceId)
        .eq("id", input.routeId)
        .limit(1);
    }
    const draft = await draftQuery.maybeSingle();
    if (draft.error || !draft.data) {
      return strictJsonResponse(request, {
        error: "No hay un borrador de ruta para confirmar.",
      }, 404);
    }
    await context.supabase
      .from("visit_routes")
      .update({ status: "canceled" })
      .eq("service_id", input.serviceId)
      .eq("route_date", today)
      .eq("status", "published")
      .neq("id", draft.data.id);
    const published = await context.supabase
      .from("visit_routes")
      .update({
        status: "published",
        confirmed_at: new Date().toISOString(),
        confirmed_by: context.actor.uid,
      })
      .eq("id", draft.data.id)
      .select("*")
      .single();
    if (published.error) {
      return strictJsonResponse(request, {
        error: "No fue posible confirmar la ruta.",
      }, 500);
    }
    return strictJsonResponse(request, {
      data: { route: published.data, duplicate: false },
    });
  }

  const existing = await context.supabase
    .from("visit_routes")
    .select("*")
    .eq("service_id", input.serviceId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
  if (existing.error) {
    return strictJsonResponse(request, {
      error: "No fue posible consultar la ruta.",
    }, 500);
  }
  if (existing.data && existing.data.generated_by_source === "grok") {
    const route = await applyDeviceOriginToGrokDraft(
      context.supabase,
      existing.data as Record<string, unknown>,
      input.start,
    );
    return strictJsonResponse(request, {
      data: { route, duplicate: true, waiting: false },
    });
  }

  const todayDraft = await context.supabase
    .from("visit_routes")
    .select("*")
    .eq("service_id", input.serviceId)
    .eq("route_date", bogotaDate(new Date()))
    .neq("status", "canceled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (todayDraft.data && todayDraft.data.generated_by_source === "grok") {
    const route = await applyDeviceOriginToGrokDraft(
      context.supabase,
      todayDraft.data as Record<string, unknown>,
      input.start,
    );
    return strictJsonResponse(request, {
      data: { route, duplicate: true, waiting: false },
    });
  }

  return strictJsonResponse(request, {
    data: {
      route: null,
      waiting: true,
      duplicate: false,
      reason: "Esperando decisión de Grok",
    },
  });
});
