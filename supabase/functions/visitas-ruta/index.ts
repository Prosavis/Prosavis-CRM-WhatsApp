import { requireAdmin } from "../_shared/adminAuth.ts";
import {
  strictJsonResponse,
  strictPreflightResponse,
} from "../_shared/strictCors.ts";
import { presentVisitPayment } from "../_shared/visitFinance.ts";
import {
  applyDeviceOriginToDraftStops,
  applyGeocodeToDirectoryAddresses,
  euclideanDirectionsOverlay,
  existingDirectionsOverlay,
  fetchGoogleDirectionsOverlay,
  fetchGoogleRouteSeconds,
  hydrateStopsWithGeocode,
  isUsableGeoPoint,
  mergeRouteGeoNotes,
  normalizeDraftStops,
  usableRoutePoints,
  type GeoPoint,
  type VisitRouteStop,
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

async function attachAddressHints(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  stops: VisitRouteStop[],
): Promise<VisitRouteStop[]> {
  const ids = [...new Set(
    stops
      .filter((stop) =>
        stop.directoryId &&
        stop.addressLine?.trim() &&
        stop.geoQuality !== "unresolved"
      )
      .map((stop) => stop.directoryId as string),
  )];
  if (ids.length === 0) return stops;
  const { data } = await supabase
    .from("crm_directory")
    .select("id, service_addresses")
    .in("id", ids);
  const hints = new Map<string, string>();
  for (const row of data ?? []) {
    if (!isRecord(row) || typeof row.id !== "string") continue;
    const addresses = Array.isArray(row.service_addresses)
      ? row.service_addresses.filter(isRecord)
      : [];
    const match = addresses.find((item) => item.isDefault === true) ??
      addresses[0];
    const reference = typeof match?.reference === "string"
      ? match.reference.trim()
      : "";
    if (reference) hints.set(row.id, reference);
  }
  return stops.map((stop) => {
    const hint = stop.directoryId ? hints.get(stop.directoryId) : undefined;
    return hint && !stop.addressHint ? { ...stop, addressHint: hint } : stop;
  });
}

async function persistGeocodedDirectoryStops(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  previous: VisitRouteStop[],
  next: VisitRouteStop[],
): Promise<void> {
  for (const stop of next) {
    if (stop.locationSource !== "geocode" || !stop.directoryId) continue;
    const before = previous.find((item) =>
      item.clientReference === stop.clientReference
    );
    if (
      before &&
      before.latitude === stop.latitude &&
      before.longitude === stop.longitude &&
      before.locationSource === "geocode"
    ) {
      continue;
    }
    const { data } = await supabase
      .from("crm_directory")
      .select("service_addresses")
      .eq("id", stop.directoryId)
      .maybeSingle();
    const patched = applyGeocodeToDirectoryAddresses(
      data?.service_addresses,
      stop,
    );
    if (!patched) continue;
    await supabase.from("crm_directory").update({
      service_addresses: patched.serviceAddresses,
      preferred_google_maps_url: patched.preferredGoogleMapsUrl,
      preferred_waze_url: patched.preferredWazeUrl,
    }).eq("id", stop.directoryId);
  }
}

async function enrichVisitRoute(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  route: Record<string, unknown>,
  start: GeoPoint | undefined,
  reorder: boolean,
): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY")?.trim() ?? "";
  const draftStops = await attachAddressHints(
    supabase,
    normalizeDraftStops(route.stops),
  );
  const hydrated = await hydrateStopsWithGeocode(draftStops, apiKey);
  if (hydrated.changed) {
    await persistGeocodedDirectoryStops(supabase, draftStops, hydrated.stops);
  }
  let stops = hydrated.stops;
  let originApplied = isRecord(route.geo_notes) &&
    route.geo_notes.originApplied === true;
  let travelProvider =
    typeof route.travel_provider === "string" && route.travel_provider
      ? route.travel_provider
      : "euclidean_fallback";
  let orderChanged = false;

  if (reorder && start && isUsableGeoPoint(start)) {
    const points: GeoPoint[] = [start, ...usableRoutePoints(stops)];
    const travelTimeSeconds = apiKey
      ? await fetchGoogleRouteSeconds(points, apiKey)
      : null;
    const result = applyDeviceOriginToDraftStops({
      stops,
      start,
      travelTimeSeconds: travelTimeSeconds ?? undefined,
    });
    if (result.originApplied) {
      stops = result.stops;
      originApplied = true;
      travelProvider = result.travelProvider;
      orderChanged = result.changed;
    }
  }

  const routeOrigin = reorder && start && isUsableGeoPoint(start) ? start : null;
  const reused = !hydrated.changed && !orderChanged
    ? existingDirectionsOverlay(route.geo_notes)
    : null;
  const shouldUpgradeToGoogle = Boolean(apiKey) && reused?.travelProvider === "euclidean_fallback";
  const overlay = (!shouldUpgradeToGoogle && reused) || (apiKey
    ? await fetchGoogleDirectionsOverlay(routeOrigin, stops, apiKey)
    : null);
  const directions = overlay ?? euclideanDirectionsOverlay(routeOrigin, stops);
  travelProvider = directions.travelProvider;
  const geoNotes = mergeRouteGeoNotes(geoNotesWithoutStart(route.geo_notes), directions, {
    originApplied,
    includesOrigin: Boolean(routeOrigin) ||
      Boolean(reused && isRecord(route.geo_notes) && route.geo_notes.includesOrigin === true),
    excludedWithoutGeo: stops.length - usableRoutePoints(stops).length,
  });

  const alreadySameOrder = !orderChanged && !hydrated.changed;
  const alreadySameNotes = isRecord(route.geo_notes) &&
    route.geo_notes.overviewPolyline === geoNotes.overviewPolyline &&
    route.geo_notes.totalDistanceMeters === geoNotes.totalDistanceMeters;
  if (alreadySameOrder && alreadySameNotes) {
    return {
      ...route,
      stops,
      travel_provider: travelProvider,
      geo_notes: geoNotes,
    };
  }

  const updated = await supabase
    .from("visit_routes")
    .update({
      stops,
      travel_provider: travelProvider,
      geo_notes: geoNotes,
    })
    .eq("id", route.id)
    .select("*")
    .single();
  if (updated.error || !updated.data) {
    return {
      ...route,
      stops,
      travel_provider: travelProvider,
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
  let routeRow = routes.data?.[0] as Record<string, unknown> | undefined;
  if (!routeRow) {
    const latestPublished = await context.supabase
      .from("visit_routes")
      .select("*")
      .eq("service_id", serviceId)
      .eq("status", "published")
      .order("route_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);
    if (latestPublished.error) {
      return strictJsonResponse(
        request,
        { error: "No fue posible consultar las visitas." },
        500,
      );
    }
    routeRow = latestPublished.data?.[0] as Record<string, unknown> | undefined;
  }
  const todayRoute = routeRow
    ? await enrichVisitRoute(
      context.supabase,
      routeRow,
      undefined,
      false,
    )
    : null;
  return strictJsonResponse(request, {
    data: {
      route: todayRoute,
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
    const route = await enrichVisitRoute(
      context.supabase,
      existing.data as Record<string, unknown>,
      input.start,
      true,
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
    const route = await enrichVisitRoute(
      context.supabase,
      todayDraft.data as Record<string, unknown>,
      input.start,
      true,
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
