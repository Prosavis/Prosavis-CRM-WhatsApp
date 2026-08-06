import { requireAdmin } from "../_shared/adminAuth.ts";
import {
  strictJsonResponse,
  strictPreflightResponse,
} from "../_shared/strictCors.ts";
import {
  parseVisitRegistration,
  type VisitRegistrationInput,
} from "../_shared/visitRegistration.ts";
import { buildVisitAttentionAlert } from "../_shared/visitAttentionAlert.ts";

const MAX_BODY_BYTES = 32_768;

interface PersistedRow {
  id: string;
  [key: string]: unknown;
}

async function findByIdempotency(
  supabase: ReturnType<typeof requireAdmin> extends Promise<{
    supabase: infer Client;
  }>
    ? Client
    : never,
  table: string,
  serviceId: string,
  idempotencyKey: string,
): Promise<PersistedRow | null> {
  const result = await supabase
    .from(table)
    .select("*")
    .eq("service_id", serviceId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (result.error) throw new Error(`No fue posible consultar ${table}.`);
  return result.data as PersistedRow | null;
}

async function persistVisit(
  context: Awaited<ReturnType<typeof requireAdmin>>,
  input: VisitRegistrationInput,
  now: string,
): Promise<{ visit: PersistedRow; duplicate: boolean }> {
  const existing = await findByIdempotency(
    context.supabase,
    "client_visits",
    input.serviceId,
    input.idempotencyKey,
  );
  if (existing) return { visit: existing, duplicate: true };

  const inserted = await context.supabase
    .from("client_visits")
    .insert({
      service_id: input.serviceId,
      client_reference: input.clientReference,
      directory_id: input.directoryId,
      route_id: input.routeId,
      route_sequence: input.routeSequence,
      visit_type: input.referral ? "referral" : "routine",
      status: "completed",
      visited_at: now,
      satisfaction: input.satisfaction,
      notes: input.notes,
      performed_by: context.actor.uid,
      idempotency_key: input.idempotencyKey,
    })
    .select("*")
    .single();
  if (!inserted.error) {
    return { visit: inserted.data as PersistedRow, duplicate: false };
  }
  if (inserted.error.code === "23505") {
    const duplicate = await findByIdempotency(
      context.supabase,
      "client_visits",
      input.serviceId,
      input.idempotencyKey,
    );
    if (duplicate) return { visit: duplicate, duplicate: true };
  }
  throw new Error("No fue posible registrar la visita.");
}

async function persistComplaint(
  context: Awaited<ReturnType<typeof requireAdmin>>,
  input: VisitRegistrationInput,
  visitId: string,
): Promise<PersistedRow | null> {
  if (input.satisfaction > 2) return null;
  const idempotencyKey = `${input.idempotencyKey}:complaint`;
  const existing = await findByIdempotency(
    context.supabase,
    "quejas",
    input.serviceId,
    idempotencyKey,
  );
  if (existing) return existing;

  const inserted = await context.supabase
    .from("quejas")
    .insert({
      service_id: input.serviceId,
      client_reference: input.clientReference,
      directory_id: input.directoryId,
      source_visit_id: visitId,
      category: "service_quality",
      severity: input.satisfaction === 1 ? "critical" : "high",
      summary: `Satisfacción ${input.satisfaction}/5: atención hoy`,
      details: input.notes,
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single();
  if (!inserted.error) return inserted.data as PersistedRow;
  if (inserted.error.code === "23505") {
    return await findByIdempotency(
      context.supabase,
      "quejas",
      input.serviceId,
      idempotencyKey,
    );
  }
  throw new Error("La visita se guardó, pero la queja no pudo escalarse.");
}

async function persistReferral(
  context: Awaited<ReturnType<typeof requireAdmin>>,
  input: VisitRegistrationInput,
  visitId: string,
): Promise<{ referral: PersistedRow; opportunity: PersistedRow } | null> {
  if (!input.referral) return null;
  const referralKey = `${input.idempotencyKey}:referral`;
  let referral = await findByIdempotency(
    context.supabase,
    "referrals",
    input.serviceId,
    referralKey,
  );
  if (!referral) {
    const inserted = await context.supabase
      .from("referrals")
      .insert({
        service_id: input.serviceId,
        client_reference: input.clientReference,
        directory_id: input.directoryId,
        source_visit_id: visitId,
        referred_name: input.referral.name,
        referred_phone: input.referral.phone,
        referred_email: input.referral.email,
        relationship: input.referral.relationship,
        idempotency_key: referralKey,
        created_by: context.actor.uid,
      })
      .select("*")
      .single();
    if (!inserted.error) {
      referral = inserted.data as PersistedRow;
    } else if (inserted.error.code === "23505") {
      referral = await findByIdempotency(
        context.supabase,
        "referrals",
        input.serviceId,
        referralKey,
      );
    }
  }
  if (!referral) {
    throw new Error(
      "La visita se guardó, pero el referido no pudo registrarse.",
    );
  }

  const opportunityKey = `${referralKey}:lead`;
  let opportunity = await findByIdempotency(
    context.supabase,
    "opportunities",
    input.serviceId,
    opportunityKey,
  );
  if (!opportunity) {
    const inserted = await context.supabase
      .from("opportunities")
      .insert({
        service_id: input.serviceId,
        client_reference: input.clientReference,
        directory_id: input.directoryId,
        source_visit_id: visitId,
        source_referral_id: referral.id,
        opportunity_type: "referral",
        title: `Referido: ${input.referral.name}`,
        estimated_value_cop: 0,
        owner_id: context.actor.uid,
        idempotency_key: opportunityKey,
      })
      .select("*")
      .single();
    if (!inserted.error) {
      opportunity = inserted.data as PersistedRow;
    } else if (inserted.error.code === "23505") {
      opportunity = await findByIdempotency(
        context.supabase,
        "opportunities",
        input.serviceId,
        opportunityKey,
      );
    }
  }
  if (!opportunity) {
    throw new Error(
      "La visita y el referido se guardaron, pero el lead no pudo crearse.",
    );
  }
  return { referral, opportunity };
}

async function persistOpportunity(
  context: Awaited<ReturnType<typeof requireAdmin>>,
  input: VisitRegistrationInput,
  visitId: string,
): Promise<PersistedRow | null> {
  if (!input.opportunity) return null;
  const idempotencyKey = `${input.idempotencyKey}:opportunity`;
  const existing = await findByIdempotency(
    context.supabase,
    "opportunities",
    input.serviceId,
    idempotencyKey,
  );
  if (existing) return existing;

  const inserted = await context.supabase
    .from("opportunities")
    .insert({
      service_id: input.serviceId,
      client_reference: input.clientReference,
      directory_id: input.directoryId,
      source_visit_id: visitId,
      opportunity_type: input.opportunity.type,
      title: input.opportunity.title,
      estimated_value_cop: input.opportunity.estimatedValueCop,
      next_action_on: input.opportunity.nextActionOn,
      notes: input.opportunity.notes,
      owner_id: context.actor.uid,
      idempotency_key: idempotencyKey,
    })
    .select("*")
    .single();
  if (!inserted.error) return inserted.data as PersistedRow;
  if (inserted.error.code === "23505") {
    return await findByIdempotency(
      context.supabase,
      "opportunities",
      input.serviceId,
      idempotencyKey,
    );
  }
  throw new Error(
    "La visita se guardó, pero la oportunidad no pudo registrarse.",
  );
}

async function sendAttentionTodayAlertBestEffort(input: {
  complaint: PersistedRow | null;
  satisfaction: number;
  duplicate: boolean;
}): Promise<void> {
  if (!input.complaint || input.duplicate) return;
  try {
    const to = Deno.env.get("VISITS_ALERT_PHONE")?.trim() ?? "";
    const userConsoleUrl = Deno.env.get("USER_CONSOLE_URL")?.trim() ?? "";
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim() ?? "";
    const phoneNumberId =
      Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim() ?? "";
    const enabled =
      Deno.env.get("ENABLE_META_SEND")?.trim().toLowerCase() === "true";
    if (!to || !userConsoleUrl || !accessToken || !phoneNumberId || !enabled) {
      return;
    }
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: {
            preview_url: false,
            body: buildVisitAttentionAlert({
              satisfaction: input.satisfaction,
              complaintId: input.complaint.id,
              userConsoleUrl,
            }),
          },
        }),
      },
    );
    if (!response.ok) {
      throw new Error("Meta send failed");
    }
  } catch {
    console.warn("[visitas-registrar] attention alert unavailable", {
      request_id: crypto.randomUUID(),
      spec_version: "v5",
      error_type: "visit_attention_alert_error",
    });
  }
}

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

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return strictJsonResponse(
      request,
      { error: "Body demasiado grande." },
      413,
    );
  }

  let input: VisitRegistrationInput;
  try {
    input = parseVisitRegistration(await request.json());
  } catch (error) {
    return strictJsonResponse(
      request,
      { error: error instanceof Error ? error.message : "Body inválido." },
      400,
    );
  }

  try {
    const persisted = await persistVisit(
      context,
      input,
      new Date().toISOString(),
    );
    const complaint = await persistComplaint(
      context,
      input,
      persisted.visit.id,
    );
    const referralLead = await persistReferral(
      context,
      input,
      persisted.visit.id,
    );
    const opportunity = await persistOpportunity(
      context,
      input,
      persisted.visit.id,
    );
    await sendAttentionTodayAlertBestEffort({
      complaint,
      satisfaction: input.satisfaction,
      duplicate: persisted.duplicate,
    });

    return strictJsonResponse(
      request,
      {
        data: {
          visit: persisted.visit,
          complaint,
          referral: referralLead?.referral ?? null,
          referralOpportunity: referralLead?.opportunity ?? null,
          opportunity,
          duplicate: persisted.duplicate,
          attentionToday: complaint !== null,
        },
      },
      persisted.duplicate ? 200 : 201,
    );
  } catch (error) {
    console.error("[visitas-registrar] persistence failed", {
      request_id: crypto.randomUUID(),
      spec_version: "v5",
      error_type: "visit_persistence_error",
    });
    return strictJsonResponse(
      request,
      {
        error:
          error instanceof Error
            ? error.message
            : "No fue posible registrar la visita.",
      },
      409,
    );
  }
});
