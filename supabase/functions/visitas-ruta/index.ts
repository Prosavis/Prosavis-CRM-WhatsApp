import { requireAdmin } from "../_shared/adminAuth.ts";
import {
  strictJsonResponse,
  strictPreflightResponse,
} from "../_shared/strictCors.ts";
import {
  buildVisitRoute,
  type VisitCandidate,
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
  serviceId: string;
  weeklyQuota: number;
  cooldownDays: number;
  idempotencyKey: string;
  start?: { latitude: number; longitude: number };
}

interface DirectoryRow {
  id: string;
  display_name: string | null;
  full_name: string | null;
  quality_tag: string | null;
  opt_out: boolean | null;
  pending_amount: number | null;
  app_user_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface BookingValueRow {
  client_id: string | null;
  total_cop: number | null;
}

interface ComplaintRow {
  client_reference: string;
}

interface VisitHistoryRow {
  client_reference: string;
  visited_at: string | null;
  status: string;
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
    start = {
      latitude: value.start.latitude,
      longitude: value.start.longitude,
    };
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
  };
}

function bogotaDate(value: Date): string {
  const parts = BOGOTA_DATE_FORMATTER.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function startOfBogotaWeek(now: Date): string {
  const localDate = new Date(`${bogotaDate(now)}T12:00:00.000Z`);
  const day = localDate.getUTCDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  localDate.setUTCDate(localDate.getUTCDate() - daysFromMonday);
  return bogotaDate(localDate);
}

function numericMetadata(
  metadata: Record<string, unknown> | null,
  key: string,
): number | null {
  const direct = metadata?.[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const address = metadata?.address;
  if (isRecord(address)) {
    const nested = address[key];
    if (typeof nested === "number" && Number.isFinite(nested)) return nested;
  }
  return null;
}

function clientReference(row: DirectoryRow): string {
  const sourceIds = row.metadata?.source_ids;
  const firebaseReference = isRecord(sourceIds)
    ? sourceIds.firebase_crmClient_docId
    : null;
  return typeof firebaseReference === "string" && firebaseReference.trim()
    ? firebaseReference.trim()
    : row.app_user_id?.trim() || row.id;
}

function normalizeQuality(
  value: string | null,
): VisitCandidate["quality"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "bad") return "bad";
  if (normalized === "standard") return "standard";
  if (normalized === "good") return "good";
  return "unknown";
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
  const [routes, visits, complaints, opportunities, referrals] = await Promise
    .all([
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
  if (existing.data) {
    return strictJsonResponse(request, {
      data: { route: existing.data, duplicate: true },
    });
  }

  const now = new Date();
  const weekStart = startOfBogotaWeek(now);
  const [directory, bookings, complaints, visits] = await Promise.all([
    context.supabase
      .from("crm_directory")
      .select(
        "id,display_name,full_name,quality_tag,opt_out,pending_amount,app_user_id,metadata",
      )
      .eq("service_id", input.serviceId)
      .eq("status", "active")
      .limit(2_000),
    context.supabase
      .from("bookings")
      .select("client_id,total_cop")
      .eq("service_id", input.serviceId)
      .is("source_deleted_at", null)
      .limit(10_000),
    context.supabase
      .from("quejas")
      .select("client_reference")
      .eq("service_id", input.serviceId)
      .in("status", ["open", "in_progress"]),
    context.supabase
      .from("client_visits")
      .select("client_reference,visited_at,status")
      .eq("service_id", input.serviceId)
      .order("visited_at", { ascending: false })
      .limit(10_000),
  ]);

  if (
    directory.error ||
    bookings.error ||
    complaints.error ||
    visits.error
  ) {
    console.error("[visitas-ruta] candidate query failed", {
      request_id: crypto.randomUUID(),
      spec_version: "v5",
      error_type: "candidate_query_error",
    });
    return strictJsonResponse(
      request,
      { error: "No fue posible construir la ruta." },
      500,
    );
  }

  const bookingValue = new Map<string, number>();
  for (const row of (bookings.data ?? []) as BookingValueRow[]) {
    if (!row.client_id) continue;
    bookingValue.set(
      row.client_id,
      (bookingValue.get(row.client_id) ?? 0) +
        Math.max(0, Number(row.total_cop ?? 0)),
    );
  }
  const complaintClients = new Set(
    ((complaints.data ?? []) as ComplaintRow[]).map(
      (row) => row.client_reference,
    ),
  );
  const lastVisit = new Map<string, string>();
  let completedThisWeek = 0;
  for (const row of (visits.data ?? []) as VisitHistoryRow[]) {
    if (row.status !== "completed" || !row.visited_at) continue;
    if (!lastVisit.has(row.client_reference)) {
      lastVisit.set(row.client_reference, row.visited_at);
    }
    if (row.visited_at.slice(0, 10) >= weekStart) completedThisWeek += 1;
  }

  const candidates = ((directory.data ?? []) as DirectoryRow[]).map((row) => {
    const reference = clientReference(row);
    const pendingAmount = Math.max(0, Number(row.pending_amount ?? 0));
    return {
      clientReference: reference,
      displayName: row.display_name?.trim() || row.full_name?.trim() ||
        "Cliente",
      quality: normalizeQuality(row.quality_tag),
      lifetimeValueCop: bookingValue.get(reference) ?? 0,
      riskScore: Math.min(100, Math.round(pendingAmount / 10_000)),
      openComplaint: complaintClients.has(reference),
      optOut: row.opt_out === true,
      lastVisitAt: lastVisit.get(reference) ?? null,
      latitude: numericMetadata(row.metadata, "latitude"),
      longitude: numericMetadata(row.metadata, "longitude"),
    } satisfies VisitCandidate;
  });

  const plan = buildVisitRoute(candidates, {
    now,
    weeklyQuota: input.weeklyQuota,
    completedThisWeek,
    cooldownDays: input.cooldownDays,
    start: input.start,
  });
  const inserted = await context.supabase
    .from("visit_routes")
    .insert({
      service_id: input.serviceId,
      route_date: bogotaDate(now),
      weekly_quota: input.weeklyQuota,
      completed_this_week: completedThisWeek,
      effective_quota: plan.effectiveQuota,
      cooldown_days: input.cooldownDays,
      stops: plan.stops,
      excluded: plan.excluded,
      generated_by: context.actor.uid,
      idempotency_key: input.idempotencyKey,
    })
    .select("*")
    .single();

  if (inserted.error) {
    if (inserted.error.code === "23505") {
      const duplicate = await context.supabase
        .from("visit_routes")
        .select("*")
        .eq("service_id", input.serviceId)
        .eq("idempotency_key", input.idempotencyKey)
        .single();
      if (!duplicate.error) {
        return strictJsonResponse(request, {
          data: { route: duplicate.data, duplicate: true },
        });
      }
    }
    return strictJsonResponse(
      request,
      { error: "No fue posible guardar la ruta." },
      500,
    );
  }

  return strictJsonResponse(request, {
    data: { route: inserted.data, duplicate: false },
  }, 201);
});
