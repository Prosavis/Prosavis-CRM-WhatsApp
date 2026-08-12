import { requireAdmin } from "../_shared/adminAuth.ts";
import {
  type AgendaRecoveryAddonInput,
  type AgendaRecoveryWindowInput,
  buildAgendaRecoveryAlternatives,
  formatRecoveryWhatsAppScript,
} from "../_shared/agendaRecovery.ts";
import {
  type AgendaOptionsApiRequest,
  parseAgendaOptionsRequest,
} from "../_shared/agenda/api.ts";
import { buildAgendaOptions } from "../_shared/agenda/engine.ts";
import {
  loadAgendaRuntimeConfig,
  resolveEffectiveAutomationLevel,
} from "../_shared/agenda/runtimeConfig.ts";
import {
  bogotaMinuteOfDay,
  operationalDateUtcRange,
  subtractOccupiedWindows,
} from "../_shared/agenda/schedule.ts";
import type {
  CleanerAgendaSnapshot,
  MinuteWindow,
  TravelLocation,
  TravelMatrixEntry,
} from "../_shared/agenda/types.ts";
import {
  strictJsonResponse,
  strictPreflightResponse,
} from "../_shared/strictCors.ts";

interface UnknownRecord {
  [key: string]: unknown;
}

interface MemberRow extends UnknownRecord {
  id: string;
}

interface AvailabilityRow extends UnknownRecord {
  cleaner_id: string;
  window_start: string;
  window_end: string;
}

interface CrewRow extends UnknownRecord {
  cleaner_id: string;
  scheduled_start: string;
  scheduled_end: string;
}

interface FactRow extends UnknownRecord {
  cleaner_id: string;
  equivalent_days: number | string | null;
}

interface MatrixRow extends UnknownRecord {
  origin_comuna: string;
  destination_comuna: string;
  hour_bucket: number;
  minutes_estimate: number | string;
  sample_count: number;
}

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function bookingFromCrew(row: CrewRow): UnknownRecord | null {
  const nested = row.bookings;
  if (Array.isArray(nested)) return record(nested[0]);
  return record(nested);
}

function optionalNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
    ? Number(value)
    : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function locationFrom(
  source: UnknownRecord | null,
  prefix: "home_" | "",
): TravelLocation {
  if (!source) return {};
  return {
    comuna: optionalString(source[`${prefix}comuna`]),
    lat: optionalNumber(
      source[prefix ? "home_latitude" : "latitude"],
    ),
    lng: optionalNumber(
      source[prefix ? "home_longitude" : "longitude"],
    ),
  };
}

function windowFromRow(row: CrewRow | AvailabilityRow): MinuteWindow | null {
  const startMinute = bogotaMinuteOfDay(row.window_start as string) ??
    bogotaMinuteOfDay(row.scheduled_start as string);
  const endMinute = bogotaMinuteOfDay(row.window_end as string) ??
    bogotaMinuteOfDay(row.scheduled_end as string);
  return startMinute !== null && endMinute !== null && startMinute < endMinute
    ? { startMinute, endMinute }
    : null;
}

function nearestLocations(
  rows: CrewRow[],
  request: AgendaOptionsApiRequest,
  fallback: TravelLocation,
): { previous: TravelLocation; next?: TravelLocation } {
  const requestedStart = request.request.clientWindow.startMinute;
  const requestedEnd = request.request.clientWindow.endMinute;
  const located = rows.flatMap((row) => {
    const window = windowFromRow(row);
    const booking = bookingFromCrew(row);
    return window && booking
      ? [{ window, location: locationFrom(booking, "") }]
      : [];
  });
  const previous = located
    .filter(({ window }) => window.endMinute <= requestedStart)
    .sort((a, b) => b.window.endMinute - a.window.endMinute)[0]?.location;
  const next = located
    .filter(({ window }) => window.startMinute >= requestedEnd)
    .sort((a, b) => a.window.startMinute - b.window.startMinute)[0]?.location;
  return { previous: previous ?? fallback, next };
}

function buildCleanerSnapshots(params: {
  members: MemberRow[];
  availability: AvailabilityRow[];
  crew: CrewRow[];
  facts: FactRow[];
  request: AgendaOptionsApiRequest;
}): CleanerAgendaSnapshot[] {
  const equivalentDays = new Map<string, number>();
  for (const fact of params.facts) {
    equivalentDays.set(
      fact.cleaner_id,
      (equivalentDays.get(fact.cleaner_id) ?? 0) +
        (optionalNumber(fact.equivalent_days) ?? 0),
    );
  }

  return params.members.flatMap((member) => {
    const availabilityRows = params.availability.filter((row) =>
      row.cleaner_id === member.id
    );
    const offered = availabilityRows.flatMap((row) => {
      const window = windowFromRow(row);
      return window ? [window] : [];
    });
    if (offered.length === 0) return [];

    const memberCrew = params.crew.filter((row) =>
      row.cleaner_id === member.id
    );
    const occupied = memberCrew.flatMap((row) => {
      const window = windowFromRow(row);
      return window ? [window] : [];
    });
    const home = locationFrom(member, "home_");
    const adjacent = nearestLocations(memberCrew, params.request, home);

    return [{
      cleanerId: member.id,
      active: member.is_active !== false &&
        member.operations_status !== "terminated",
      acceptsComposite: member.accepts_composite === true,
      serviceSkills: Array.isArray(member.service_skills)
        ? member.service_skills.filter((value): value is string =>
          typeof value === "string"
        )
        : undefined,
      alturasCertified: member.alturas_certified === true,
      alturasExpiresOn: optionalString(
        member.alturas_certification_expires_on,
      ),
      equivalentDays: equivalentDays.has(member.id)
        ? equivalentDays.get(member.id)
        : undefined,
      alreadyWorkedThatDay: memberCrew.length > 0,
      availableWindows: subtractOccupiedWindows(offered, occupied),
      location: adjacent.previous,
      nextLocation: adjacent.next,
    }];
  });
}

function matrixEntries(rows: MatrixRow[]): TravelMatrixEntry[] {
  return rows.flatMap((row) => {
    const minutesEstimate = optionalNumber(row.minutes_estimate);
    return minutesEstimate === undefined ? [] : [{
      originComuna: row.origin_comuna,
      destinationComuna: row.destination_comuna,
      hourBucket: row.hour_bucket,
      minutesEstimate,
      sampleCount: row.sample_count,
    }];
  });
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return strictPreflightResponse(request);
  if (request.method === "GET") return serveRecoveryAgendaOptions(request);
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

  const envRuntime = loadAgendaRuntimeConfig();
  let parsed: AgendaOptionsApiRequest;
  try {
    parsed = parseAgendaOptionsRequest(await request.json(), envRuntime);
  } catch (error) {
    return strictJsonResponse(
      request,
      { error: error instanceof Error ? error.message : "Solicitud inválida." },
      400,
    );
  }

  const policy = await context.supabase
    .from("ops_automation_policies")
    .select("policy_level,level_2_enabled,level_3_human_approved_at")
    .eq("service_id", parsed.serviceId)
    .maybeSingle();
  const automationLevel = resolveEffectiveAutomationLevel({
    envLevel: envRuntime.automationLevel,
    policyLevel: optionalNumber(policy.data?.policy_level),
    level2Enabled: policy.data?.level_2_enabled === true,
    level3Approved: Boolean(policy.data?.level_3_human_approved_at),
  });
  const runtime = { ...envRuntime, automationLevel };
  parsed.request.automationLevel = automationLevel;

  const requestContext = {
    service_id: parsed.serviceId,
    appointment_id: parsed.appointmentId ?? null,
    building_id: parsed.buildingId ?? null,
    client_id: parsed.clientId ?? null,
    tier: parsed.tier,
    date: parsed.request.operationalDate,
    window: parsed.request.clientWindow,
    required_minutes: parsed.request.requiredMinutes,
    composite_member_minutes: parsed.request.compositeMemberMinutes ?? null,
    service_type: parsed.request.serviceType ?? null,
    requires_alturas: parsed.request.requiresAlturas,
    destination: parsed.request.destination,
  };
  const requestHash = await sha256(requestContext);

  const existing = await context.supabase
    .from("assignment_decisions")
    .select(
      "id,request_hash,candidates,suggested_option_id,feature_vector_stamp,saga_status",
    )
    .eq("service_id", parsed.serviceId)
    .eq("request_id", parsed.request.requestId)
    .maybeSingle();
  if (existing.error) {
    return strictJsonResponse(
      request,
      { error: "No fue posible validar la idempotencia." },
      500,
    );
  }
  if (existing.data) {
    if (existing.data.request_hash !== requestHash) {
      return strictJsonResponse(
        request,
        { error: "request_id ya fue usado con otro contexto." },
        409,
      );
    }
    return strictJsonResponse(request, {
      data: {
        decisionId: existing.data.id,
        options: existing.data.candidates,
        suggestedOptionId: existing.data.suggested_option_id,
        featureVectorStamp: existing.data.feature_vector_stamp,
        sagaStatus: existing.data.saga_status,
        idempotent: true,
      },
    });
  }

  const range = operationalDateUtcRange(parsed.request.operationalDate);
  const monthStart = `${parsed.request.operationalDate.slice(0, 8)}01`;
  const activeStatuses = [
    "PENDING",
    "PENDING_RESCHEDULE",
    "CONFIRMED",
    "EN_ROUTE",
    "IN_PROGRESS",
  ];
  const [members, availability, crew, facts, matrix] = await Promise.all([
    context.supabase
      .from("crm_team_members")
      .select(
        "id,is_active,operations_status,accepts_composite,service_skills,alturas_certified,alturas_certification_expires_on,home_comuna,home_latitude,home_longitude",
      )
      .eq("service_id", parsed.serviceId),
    context.supabase
      .from("cleaner_availability")
      .select("cleaner_id,window_start,window_end")
      .eq("service_id", parsed.serviceId)
      .eq("operational_date", parsed.request.operationalDate)
      .gt("accepted_minutes", 0),
    context.supabase
      .from("booking_crew")
      .select(
        "cleaner_id,scheduled_start,scheduled_end,bookings!inner(service_id,status,comuna,latitude,longitude)",
      )
      .eq("service_id", parsed.serviceId)
      .gte("scheduled_start", range.start)
      .lt("scheduled_start", range.end)
      .in("bookings.status", activeStatuses),
    context.supabase
      .from("cleaner_day_facts")
      .select("cleaner_id,equivalent_days")
      .eq("service_id", parsed.serviceId)
      .gte("operational_date", monthStart)
      .lte("operational_date", parsed.request.operationalDate),
    context.supabase
      .from("comuna_travel_matrix")
      .select(
        "origin_comuna,destination_comuna,hour_bucket,minutes_estimate,sample_count",
      )
      .eq("service_id", parsed.serviceId),
  ]);
  if (
    members.error ||
    availability.error ||
    crew.error ||
    facts.error ||
    matrix.error
  ) {
    console.error("[agenda-opciones] projection query failed", {
      request_id: parsed.request.requestId,
      spec_version: runtime.specVersion,
    });
    return strictJsonResponse(
      request,
      { error: "No fue posible construir las opciones." },
      500,
    );
  }

  const cleaners = buildCleanerSnapshots({
    members: (members.data ?? []) as unknown as MemberRow[],
    availability: (availability.data ?? []) as AvailabilityRow[],
    crew: (crew.data ?? []) as CrewRow[],
    facts: (facts.data ?? []) as FactRow[],
    request: parsed,
  });
  const result = buildAgendaOptions({
    request: parsed.request,
    cleaners,
    compliance: runtime.compliance,
    costConfig: runtime.costConfig,
    travelConfig: runtime.travelConfig,
    weights: runtime.weights,
    travelMatrix: matrixEntries((matrix.data ?? []) as MatrixRow[]),
  });

  const inserted = await context.supabase
    .from("assignment_decisions")
    .insert({
      service_id: parsed.serviceId,
      request_id: parsed.request.requestId,
      request_hash: requestHash,
      request_context: requestContext,
      candidates: result.options,
      suggested_option_id: result.suggestedOptionId,
      spec_version: runtime.specVersion,
      engine_weights: runtime.weights,
      automation_level: runtime.automationLevel,
      feature_vector_stamp: result.featureVectorStamp,
      saga_status: "proposed",
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) {
    console.error("[agenda-opciones] decision insert failed", {
      request_id: parsed.request.requestId,
      spec_version: runtime.specVersion,
    });
    return strictJsonResponse(
      request,
      { error: "No fue posible registrar la decisión." },
      500,
    );
  }

  return strictJsonResponse(request, {
    data: {
      decisionId: inserted.data.id,
      options: result.options,
      suggestedOptionId: result.suggestedOptionId,
      featureVectorStamp: result.featureVectorStamp,
      flags: result.globalFlags,
      sagaStatus: "proposed",
      idempotent: false,
    },
  }, 201);
});

interface RecoveryCandidateRow {
  id: string;
  cleaner_id: string;
  operational_date: string;
  window_start: string;
  window_end: string;
  available_minutes: number;
  single_price_cop: number | null;
  pair_price_cop: number | null;
  estimated_marginal_cost_cop: number | null;
  flags: string[] | null;
  addons: unknown;
  suggested_client_name: string | null;
}

interface RecoveryMemberRow {
  id: string;
  name: string;
  accepts_composite: boolean | null;
}

const SERVICE_ID_PATTERN = /^[A-Za-z0-9_-]{3,160}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseRecoverySummaryRequest(
  url: URL,
): { serviceId: string; date: string; appointmentId?: string } {
  const serviceId = url.searchParams.get("serviceId")?.trim() ?? "";
  const date = url.searchParams.get("date")?.trim() ?? "";
  const appointmentId = url.searchParams.get("appointmentId")?.trim() ?? "";
  if (!SERVICE_ID_PATTERN.test(serviceId)) {
    throw new Error("serviceId inválido.");
  }
  if (!DATE_PATTERN.test(date)) {
    throw new Error("date debe usar formato YYYY-MM-DD.");
  }
  const parsed = new Date(`${date}T12:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error("date inválida.");
  }
  if (
    appointmentId &&
    (appointmentId.length > 160 || appointmentId.includes("/"))
  ) {
    throw new Error("appointmentId inválido.");
  }
  return {
    serviceId,
    date,
    ...(appointmentId ? { appointmentId } : {}),
  };
}

function parseAddons(value: unknown): AgendaRecoveryAddonInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    const addonId = typeof record.addonId === "string"
      ? record.addonId.trim()
      : "";
    const label = typeof record.label === "string" ? record.label.trim() : "";
    if (!addonId || !label) return [];
    const minutes = Number(record.minutes);
    const price = record.priceCOP === null ? null : Number(record.priceCOP);
    return [{
      addonId,
      label,
      minutes: Number.isFinite(minutes) && minutes >= 0
        ? Math.round(minutes)
        : 0,
      priceCOP: price !== null && Number.isFinite(price) && price >= 0
        ? Math.round(price)
        : null,
    }];
  });
}

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Bogota",
  }).format(new Date(`${date}T12:00:00Z`));
}

export async function serveRecoveryAgendaOptions(
  request: Request,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return strictPreflightResponse(request);
  }
  if (request.method !== "GET") {
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

  let query;
  try {
    query = parseRecoverySummaryRequest(new URL(request.url));
  } catch (error) {
    return strictJsonResponse(
      request,
      {
        error: error instanceof Error ? error.message : "Parámetros inválidos.",
      },
      400,
    );
  }

  const [candidateResult, memberResult] = await Promise.all([
    context.supabase
      .from("orphan_stacking_candidates")
      .select(
        "id,cleaner_id,operational_date,window_start,window_end," +
          "available_minutes,single_price_cop,pair_price_cop," +
          "estimated_marginal_cost_cop,flags,addons,suggested_client_name",
      )
      .eq("service_id", query.serviceId)
      .eq("operational_date", query.date)
      .eq("status", "open")
      .order("window_start", { ascending: true })
      .limit(100),
    context.supabase
      .from("crm_team_members")
      .select("id,name,accepts_composite")
      .eq("service_id", query.serviceId)
      .eq("is_active", true),
  ]);

  if (candidateResult.error || memberResult.error) {
    console.error("[agenda-opciones] Query failed", {
      request_id: crypto.randomUUID(),
      spec_version: "v5",
      error_type: "agenda_options_query_error",
    });
    return strictJsonResponse(
      request,
      { error: "No fue posible consultar las opciones de agenda." },
      500,
    );
  }

  const members = new Map(
    ((memberResult.data ?? []) as unknown as RecoveryMemberRow[]).map((
      member,
    ) => [
      member.id,
      member,
    ]),
  );
  const candidates =
    (candidateResult.data ?? []) as unknown as RecoveryCandidateRow[];
  const windows: AgendaRecoveryWindowInput[] = candidates.map((candidate) => {
    const member = members.get(candidate.cleaner_id);
    return {
      id: candidate.id,
      cleanerId: candidate.cleaner_id,
      cleanerName: member?.name?.trim() || "Profesional",
      windowStart: candidate.window_start,
      windowEnd: candidate.window_end,
      availableMinutes: candidate.available_minutes,
      acceptsComposite: member?.accepts_composite === true,
      singlePriceCOP: candidate.single_price_cop,
      pairPriceCOP: candidate.pair_price_cop,
      estimatedMarginalCostCOP: candidate.estimated_marginal_cost_cop,
      addons: parseAddons(candidate.addons),
    };
  });
  const alternatives = buildAgendaRecoveryAlternatives(windows);
  const clientName =
    candidates.find((candidate) => candidate.suggested_client_name?.trim())
      ?.suggested_client_name ?? null;
  const dateLabel = formatDateLabel(query.date);
  let decisionId: string | undefined;
  let suggestedOptionId: string | undefined;

  if (query.appointmentId && alternatives.length > 0) {
    const decisionCandidates = alternatives.flatMap((alternative) => {
      const scheduledStartMinute = bogotaMinuteOfDay(alternative.windowStart);
      if (scheduledStartMinute === null) return [];
      return [{
        optionId: alternative.id,
        mode: alternative.kind === "pair" ? "composite" : "single",
        scheduledStartMinute,
        hardBlocked: !alternative.saleAllowed,
        complianceFlags: alternative.flags,
        crew: alternative.cleanerIds.map((cleanerId) => ({
          cleanerId,
          minutes: alternative.availableMinutes,
        })),
        addons: alternative.addons,
      }];
    });
    const requestContext = {
      appointment_id: query.appointmentId,
      date: query.date,
      source: "recovery_panel",
    };
    const existingDecision = await context.supabase
      .from("assignment_decisions")
      .select("id,suggested_option_id")
      .eq("service_id", query.serviceId)
      .contains("request_context", requestContext)
      .in("saga_status", ["proposed", "failed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingDecision.error) {
      return strictJsonResponse(
        request,
        { error: "No fue posible preparar la decisión de rescate." },
        500,
      );
    }
    if (existingDecision.data) {
      decisionId = existingDecision.data.id;
      suggestedOptionId = existingDecision.data.suggested_option_id ??
        undefined;
    } else if (decisionCandidates.length > 0) {
      suggestedOptionId = alternatives.find((alternative) =>
        alternative.saleAllowed
      )?.id;
      const requestHash = await sha256({
        requestContext,
        candidates: decisionCandidates,
      });
      const insertedDecision = await context.supabase
        .from("assignment_decisions")
        .insert({
          service_id: query.serviceId,
          request_id: crypto.randomUUID(),
          request_hash: requestHash,
          request_context: requestContext,
          candidates: decisionCandidates,
          suggested_option_id: suggestedOptionId ?? null,
          spec_version: "v5",
          engine_weights: {},
          feature_vector_stamp: { source: "recovery-panel-v5" },
          automation_level: 1,
          saga_status: "proposed",
        })
        .select("id")
        .single();
      if (insertedDecision.error || !insertedDecision.data) {
        return strictJsonResponse(
          request,
          { error: "No fue posible preparar la decisión de rescate." },
          500,
        );
      }
      decisionId = insertedDecision.data.id;
    }
  }

  return strictJsonResponse(request, {
    data: {
      serviceId: query.serviceId,
      operationalDate: query.date,
      generatedAt: new Date().toISOString(),
      recoverableMinutes: candidates.reduce(
        (sum, candidate) => sum + candidate.available_minutes,
        0,
      ),
      candidateCount: candidates.length,
      ...(decisionId ? { decisionId } : {}),
      ...(query.appointmentId ? { appointmentId: query.appointmentId } : {}),
      ...(suggestedOptionId ? { suggestedOptionId } : {}),
      alternatives: alternatives.map((alternative) => ({
        ...alternative,
        whatsappScript: formatRecoveryWhatsAppScript(
          clientName,
          dateLabel,
          alternative,
        ),
      })),
    },
  });
}
