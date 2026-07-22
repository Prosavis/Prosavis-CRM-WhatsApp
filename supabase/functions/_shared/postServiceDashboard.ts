// deno-lint-ignore no-import-prefix
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveClientPhoneForAppointment } from "./appointmentPhoneResolver.ts";
import {
  getFirestoreDocument,
  runFirestoreQuery,
} from "./firebaseAdminRest.ts";
import {
  buildPostServiceIdempotencyKey,
  type PostServiceFollowUpPayload,
} from "./postServiceAutomation.ts";

const TIMEZONE = "America/Bogota" as const;
const TEMPLATE_NAME = "service_finalizado" as const;

export interface PostServiceDashboard {
  meta: {
    timezone: typeof TIMEZONE;
    templateName: typeof TEMPLATE_NAME;
    lastRunAt: string | null;
  };
  summary: {
    scheduled: number;
    pending: number;
    sent: number;
    failed: number;
    dryRun: number;
    skipped: number;
  };
  recentEvents: Array<Record<string, unknown>>;
}

function timestampValue(iso: string): { timestampValue: string } {
  return { timestampValue: iso };
}

async function fetchRecentCompletedAppointments() {
  const now = Date.now();
  const startIso = new Date(now - 30 * 86_400_000).toISOString();
  const endIso = new Date(now + 2 * 86_400_000).toISOString();
  const docs = await runFirestoreQuery("appointments", {
    where: {
      compositeFilter: {
        op: "AND",
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: "scheduledDate" },
              op: "GREATER_THAN_OR_EQUAL",
              value: timestampValue(startIso),
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: "scheduledDate" },
              op: "LESS_THAN",
              value: timestampValue(endIso),
            },
          },
        ],
      },
    },
    limit: 500,
  });

  return docs
    .filter((doc) => doc.data.status === "COMPLETED")
    .sort((a, b) =>
      String(b.data.scheduledDate ?? "").localeCompare(
        String(a.data.scheduledDate ?? ""),
      )
    );
}

async function countEvents(
  supabase: SupabaseClient,
  outcome: string,
  prefix = false,
): Promise<number> {
  let query = supabase
    .from("whatsapp_post_service_events")
    .select("id", { count: "exact", head: true });
  query = prefix
    ? query.like("outcome", `${outcome}%`)
    : query.eq("outcome", outcome);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function buildPostServiceDashboard(
  supabase: SupabaseClient,
): Promise<PostServiceDashboard> {
  const [
    sent,
    failed,
    dryRun,
    skipped,
    lastRunResult,
    recentResult,
    appointments,
  ] = await Promise.all([
    countEvents(supabase, "sent"),
    countEvents(supabase, "failed"),
    countEvents(supabase, "dry_run"),
    countEvents(supabase, "skipped_", true),
    supabase
      .from("whatsapp_post_service_runs")
      .select("run_at")
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("whatsapp_post_service_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    fetchRecentCompletedAppointments(),
  ]);

  if (lastRunResult.error) throw lastRunResult.error;
  if (recentResult.error) throw recentResult.error;

  const unsent = appointments.filter(
    (appointment) => !appointment.data.postServiceWhatsAppSentAt,
  );
  const scheduled = unsent.filter(
    (appointment) => Boolean(appointment.data.postServiceWhatsAppTaskId),
  ).length;
  const scheduleFailed = unsent.filter(
    (appointment) =>
      String(appointment.data.postServiceWhatsAppLastError ?? "").startsWith(
        "schedule_failed:",
      ),
  ).length;
  const pending = unsent.filter(
    (appointment) =>
      !appointment.data.postServiceWhatsAppTaskId &&
      !appointment.data.postServiceWhatsAppLastError,
  ).length;
  const lastRunAt = lastRunResult.data?.run_at ?? null;
  const firestoreEvents = unsent.map((appointment) => {
    const data = appointment.data;
    const lastError = String(data.postServiceWhatsAppLastError ?? "").trim();
    const taskId = String(data.postServiceWhatsAppTaskId ?? "").trim();
    const scheduledDate = String(data.scheduledDate ?? "");
    const outcome = taskId ? "scheduled" : lastError ? "failed" : "pending";
    return {
      id: `firestore:${appointment.id}`,
      batch_run_id: "",
      appointment_id: appointment.id,
      directory_id: null,
      recipient_phone: String(data.clientPhone ?? "").trim() || null,
      recipient_name: String(data.clientName ?? "").trim() || null,
      service_date: scheduledDate ? formatServiceDate(scheduledDate) : "",
      template_name: TEMPLATE_NAME,
      outcome,
      error_message: lastError || null,
      wa_message_id: null,
      message_body: null,
      created_at: String(data.postServiceWhatsAppScheduledAt ?? "").trim() ||
        scheduledDate ||
        new Date().toISOString(),
    };
  });
  const unsentAppointmentIds = new Set(
    unsent.map((appointment) => appointment.id),
  );
  const persistedEvents = (
    (recentResult.data ?? []) as Array<Record<string, unknown>>
  ).filter(
    (event) => !unsentAppointmentIds.has(String(event.appointment_id ?? "")),
  );
  const recentEvents = [
    ...firestoreEvents,
    ...persistedEvents,
  ]
    .sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
    )
    .slice(0, 100);

  return {
    meta: {
      timezone: TIMEZONE,
      templateName: TEMPLATE_NAME,
      lastRunAt,
    },
    summary: {
      scheduled,
      pending,
      sent,
      failed: failed + scheduleFailed,
      dryRun,
      skipped,
    },
    recentEvents,
  };
}

function formatServiceDate(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

async function buildPayloadFromAppointment(
  supabase: SupabaseClient,
  appointmentId: string,
  data: Record<string, unknown>,
  dryRun: boolean,
): Promise<PostServiceFollowUpPayload | null> {
  if (
    data.status !== "COMPLETED" ||
    data.postServiceWhatsAppSentAt
  ) {
    return null;
  }

  const clientId = String(data.clientId ?? "").trim();
  const serviceId = String(data.serviceId ?? "").trim();
  const scheduledDate = String(data.scheduledDate ?? "").trim();
  if (!clientId || !serviceId || !scheduledDate) return null;

  const recipientPhone = await resolveClientPhoneForAppointment(supabase, data);
  if (!recipientPhone) return null;

  return {
    recipientPhone,
    clientName: String(data.clientName ?? "").trim().split(/\s+/)[0] ||
      "Cliente",
    serviceDate: formatServiceDate(scheduledDate),
    appointmentData: {
      appointmentId,
      clientId,
      serviceId,
      scheduledDate,
    },
    idempotencyKey: buildPostServiceIdempotencyKey(appointmentId),
    dryRun,
    runKind: dryRun ? "dry_run" : "retry",
    schedulerName: "post-service-automations-monitor",
  };
}

export async function loadLatestPendingPostServicePayload(
  supabase: SupabaseClient,
): Promise<PostServiceFollowUpPayload | null> {
  const appointments = await fetchRecentCompletedAppointments();
  for (const appointment of appointments) {
    const payload = await buildPayloadFromAppointment(
      supabase,
      appointment.id,
      appointment.data,
      true,
    );
    if (payload) return payload;
  }
  return null;
}

export async function loadPendingPostServicePayloadByAppointmentId(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<PostServiceFollowUpPayload | null> {
  const appointment = await getFirestoreDocument("appointments", appointmentId);
  if (!appointment) return null;
  return buildPayloadFromAppointment(
    supabase,
    appointmentId,
    appointment,
    false,
  );
}

function nextDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function fetchPostServiceHistory(
  supabase: SupabaseClient,
  params: { dateFrom: string; dateTo: string },
) {
  const fromIso = `${params.dateFrom}T00:00:00.000Z`;
  const toExclusiveIso = `${nextDateKey(params.dateTo)}T00:00:00.000Z`;
  const { data: runs, error } = await supabase
    .from("whatsapp_post_service_runs")
    .select("*")
    .gte("run_at", fromIso)
    .lt("run_at", toExclusiveIso)
    .order("run_at", { ascending: false })
    .limit(200);
  if (error) throw error;

  const runIds = (runs ?? []).map((run) => String(run.id));
  const eventsByRun: Record<string, Array<Record<string, unknown>>> = {};
  if (runIds.length > 0) {
    const { data: events, error: eventError } = await supabase
      .from("whatsapp_post_service_events")
      .select("*")
      .in("batch_run_id", runIds)
      .order("created_at", { ascending: false });
    if (eventError) throw eventError;
    for (const event of events ?? []) {
      const runId = String(event.batch_run_id);
      eventsByRun[runId] ??= [];
      eventsByRun[runId].push(event as Record<string, unknown>);
    }
  }

  return { runs: runs ?? [], eventsByRun };
}

export async function hasSentPostServiceEvent(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("whatsapp_post_service_events")
    .select("id", { count: "exact", head: true })
    .eq("appointment_id", appointmentId)
    .eq("outcome", "sent");
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function loadPostServiceRetryPayload(
  supabase: SupabaseClient,
  params: { eventId?: string; appointmentId?: string },
): Promise<PostServiceFollowUpPayload | null> {
  let query = supabase
    .from("whatsapp_post_service_events")
    .select("request_body");

  if (params.eventId) {
    query = query.eq("id", params.eventId);
  } else if (params.appointmentId) {
    query = query
      .eq("appointment_id", params.appointmentId)
      .in("outcome", ["failed", "skipped_invalid_phone"])
      .order("created_at", { ascending: false });
  } else {
    return null;
  }

  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.request_body || typeof data.request_body !== "object") return null;
  return data.request_body as PostServiceFollowUpPayload;
}

export async function setPostServicePreference(
  supabase: SupabaseClient,
  params: {
    directoryId: string;
    postServiceEnabled: boolean;
    updatedBy: string | null;
    notes?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_post_service_preferences")
    .upsert({
      directory_id: params.directoryId,
      post_service_enabled: params.postServiceEnabled,
      updated_by: params.updatedBy,
      notes: params.notes ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "directory_id" });
  if (error) throw error;
}
