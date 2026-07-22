import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  directoryPhoneKey,
  directoryPhoneLookupVariants,
  normalizeDirectoryPhoneE164,
} from "../_shared/directoryPhone.ts";
import { formatError } from "../_shared/errors.ts";
import {
  buildPostServiceMessageBody,
  buildPostServiceTemplateComponents,
  isPostServiceDirectoryStatusBlocked,
  POST_SERVICE_CAMPAIGN_TYPE,
  POST_SERVICE_TEMPLATE_LANGUAGE,
  POST_SERVICE_TEMPLATE_NAME,
  type PostServiceFollowUpPayload,
} from "../_shared/postServiceAutomation.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import {
  assertMetaSendEnabled,
  ensureConversation,
  getGraphCredentials,
  isRecipientBlocked,
  isUniqueViolation,
  persistOutboundLog,
  sendToMeta,
  updateConversationPreview,
} from "../_shared/whatsappOutbound.ts";
import {
  getStableKeyFromRecipient,
  normalizePhone,
  resolveRecipient,
} from "../_shared/whatsappIdentity.ts";

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

type PostServiceOutcome =
  | "sent"
  | "failed"
  | "dry_run"
  | "skipped_duplicate"
  | "skipped_opt_out"
  | "skipped_status"
  | "skipped_disabled"
  | "skipped_blacklisted"
  | "skipped_invalid_phone";

interface DirectoryRecipient {
  id: string;
  display_name: string | null;
  full_name: string | null;
  phone: string | null;
  opt_out: boolean | null;
  status: string | null;
}

interface ExistingSentEvent {
  wa_message_id: string | null;
  message_body: string | null;
}

function verifyApiKey(req: Request): boolean {
  const supplied = req.headers.get("x-api-key")?.trim();
  if (!supplied) return false;
  const configured = [
    Deno.env.get("POST_SERVICE_API_KEY"),
    Deno.env.get("REMINDER_API_KEY"),
    Deno.env.get("SUPABASE_CRM_WRITE_KEY"),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return configured.some((value) => value === supplied);
}

function parsePayload(value: unknown): PostServiceFollowUpPayload | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const appointmentData = body.appointmentData;
  if (!appointmentData || typeof appointmentData !== "object") return null;
  const appointment = appointmentData as Record<string, unknown>;
  const required = [
    body.recipientPhone,
    body.clientName,
    body.serviceDate,
    body.idempotencyKey,
    appointment.appointmentId,
    appointment.clientId,
    appointment.serviceId,
    appointment.scheduledDate,
  ];
  if (required.some((field) => typeof field !== "string" || !field.trim())) {
    return null;
  }
  if (Number.isNaN(new Date(String(appointment.scheduledDate)).getTime())) {
    return null;
  }

  const allowedRunKinds = new Set(["primary", "retry", "manual", "dry_run"]);
  const requestedRunKind = typeof body.runKind === "string" ? body.runKind : "";
  const dryRun = body.dryRun === true;

  return {
    recipientPhone: String(body.recipientPhone).trim(),
    clientName: String(body.clientName).trim(),
    serviceDate: String(body.serviceDate).trim(),
    appointmentData: {
      appointmentId: String(appointment.appointmentId).trim(),
      clientId: String(appointment.clientId).trim(),
      serviceId: String(appointment.serviceId).trim(),
      scheduledDate: String(appointment.scheduledDate).trim(),
    },
    idempotencyKey: String(body.idempotencyKey).trim(),
    dryRun,
    runKind: dryRun
      ? "dry_run"
      : allowedRunKinds.has(requestedRunKind)
      ? requestedRunKind as PostServiceFollowUpPayload["runKind"]
      : "primary",
    schedulerName:
      typeof body.schedulerName === "string" && body.schedulerName.trim()
        ? body.schedulerName.trim()
        : "sendPostServiceWhatsAppFollowUp",
  };
}

async function findDirectoryRecipient(
  supabase: SupabaseClient,
  payload: PostServiceFollowUpPayload,
): Promise<DirectoryRecipient | null> {
  const select = "id,display_name,full_name,phone,opt_out,status";

  const { data: byClientId, error: clientError } = await supabase
    .from("crm_directory")
    .select(select)
    .eq("app_user_id", payload.appointmentData.clientId)
    .limit(1)
    .maybeSingle();
  if (clientError) throw clientError;
  if (byClientId) return byClientId as DirectoryRecipient;

  const variants = directoryPhoneLookupVariants(payload.recipientPhone);
  if (variants.length > 0) {
    const { data: byPhone, error: phoneError } = await supabase
      .from("crm_directory")
      .select(select)
      .in("phone", variants)
      .limit(1)
      .maybeSingle();
    if (phoneError) throw phoneError;
    if (byPhone) return byPhone as DirectoryRecipient;
  }

  const phoneKey = directoryPhoneKey(payload.recipientPhone);
  if (phoneKey) {
    const { data: byPhoneKey, error: phoneKeyError } = await supabase
      .from("crm_directory")
      .select(select)
      .eq("phone_key", phoneKey)
      .limit(1)
      .maybeSingle();
    if (phoneKeyError) throw phoneKeyError;
    if (byPhoneKey) return byPhoneKey as DirectoryRecipient;
  }

  const { data: byAppointment, error: appointmentError } = await supabase
    .from("crm_directory")
    .select(select)
    .eq("appointment_id", payload.appointmentData.appointmentId)
    .limit(1)
    .maybeSingle();
  if (appointmentError) throw appointmentError;
  return (byAppointment as DirectoryRecipient | null) ?? null;
}

async function isPostServiceEnabled(
  supabase: SupabaseClient,
  directoryId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("whatsapp_post_service_preferences")
    .select("post_service_enabled")
    .eq("directory_id", directoryId)
    .maybeSingle();
  if (error) throw error;
  return data?.post_service_enabled !== false;
}

async function findSentEvent(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<ExistingSentEvent | null> {
  const { data, error } = await supabase
    .from("whatsapp_post_service_events")
    .select("wa_message_id,message_body")
    .eq("appointment_id", appointmentId)
    .eq("outcome", "sent")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as ExistingSentEvent | null) ?? null;
}

async function createRun(
  supabase: SupabaseClient,
  payload: PostServiceFollowUpPayload,
): Promise<string> {
  const { data, error } = await supabase
    .from("whatsapp_post_service_runs")
    .insert({
      run_kind: payload.runKind ?? (payload.dryRun ? "dry_run" : "primary"),
      scheduler_name: payload.schedulerName ??
        "sendPostServiceWhatsAppFollowUp",
      appointment_id: payload.appointmentData.appointmentId,
      idempotency_key: payload.idempotencyKey,
      dry_run: payload.dryRun === true,
      delivery_state: payload.dryRun ? "pending" : "sending",
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    throw error ?? new Error("No se pudo crear la ejecución.");
  }
  return String(data.id);
}

async function completeRun(
  supabase: SupabaseClient,
  runId: string,
  outcome: PostServiceOutcome,
): Promise<void> {
  const deliveryState = outcome === "sent"
    ? "sent"
    : outcome === "failed"
    ? "failed"
    : outcome === "dry_run"
    ? "pending"
    : "skipped";
  const { error } = await supabase
    .from("whatsapp_post_service_runs")
    .update({
      delivery_state: deliveryState,
      summary: { outcome },
      execution_stats: {
        sent: outcome === "sent" ? 1 : 0,
        failed: outcome === "failed" ? 1 : 0,
        dryRun: outcome === "dry_run" ? 1 : 0,
        skipped: outcome.startsWith("skipped_") ? 1 : 0,
      },
    })
    .eq("id", runId);
  if (error) throw error;
}

async function recordEvent(
  supabase: SupabaseClient,
  params: {
    runId: string;
    payload: PostServiceFollowUpPayload;
    directory: DirectoryRecipient | null;
    normalizedPhone: string | null;
    outcome: PostServiceOutcome;
    messageBody: string;
    errorMessage?: string | null;
    waMessageId?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("whatsapp_post_service_events").insert({
    batch_run_id: params.runId,
    appointment_id: params.payload.appointmentData.appointmentId,
    directory_id: params.directory?.id ?? null,
    recipient_phone: params.normalizedPhone,
    recipient_name: params.directory?.display_name ??
      params.directory?.full_name ??
      params.payload.clientName,
    service_date: params.payload.serviceDate,
    template_name: POST_SERVICE_TEMPLATE_NAME,
    outcome: params.outcome,
    error_message: params.errorMessage ?? null,
    wa_message_id: params.waMessageId ?? null,
    message_body: params.messageBody,
    request_body: params.payload,
  });
  if (error) throw error;
}

async function skipWithEvent(
  supabase: SupabaseClient,
  params: {
    runId: string;
    payload: PostServiceFollowUpPayload;
    directory: DirectoryRecipient | null;
    normalizedPhone: string | null;
    outcome: Exclude<PostServiceOutcome, "sent" | "failed" | "dry_run">;
    messageBody: string;
    error: string;
  },
): Promise<Response> {
  await recordEvent(supabase, {
    ...params,
    errorMessage: params.error,
  });
  await completeRun(supabase, params.runId, params.outcome);
  return jsonResponse({
    success: true,
    skipped: true,
    outcome: params.outcome,
    reason: params.error,
    templateName: POST_SERVICE_TEMPLATE_NAME,
    messageBody: params.messageBody,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Método no permitido." }, 405);
  }
  if (!verifyApiKey(req)) {
    return jsonResponse({ error: "No autorizado." }, 401);
  }

  const body = await req.json().catch(() => null);
  const payload = parsePayload(body);
  if (!payload) {
    return jsonResponse({
      error:
        "Payload inválido. Se requieren recipientPhone, clientName, serviceDate, appointmentData completa e idempotencyKey.",
    }, 400);
  }

  const supabase = getServiceClient();
  const messageBody = buildPostServiceMessageBody(
    payload.clientName,
    payload.serviceDate,
  );
  let runId: string | null = null;
  let directory: DirectoryRecipient | null = null;
  let normalizedPhone: string | null = null;

  try {
    try {
      runId = await createRun(supabase, payload);
    } catch (error) {
      if (!isUniqueViolation(error) || payload.dryRun) throw error;
      const existing = await findSentEvent(
        supabase,
        payload.appointmentData.appointmentId,
      );
      if (existing) {
        return jsonResponse({
          success: true,
          waMessageId: existing.wa_message_id,
          templateName: POST_SERVICE_TEMPLATE_NAME,
          messageBody: existing.message_body ?? messageBody,
          duplicate: true,
        });
      }
      return jsonResponse({
        success: false,
        error: "post_service_attempt_in_progress",
      }, 409);
    }

    const existing = await findSentEvent(
      supabase,
      payload.appointmentData.appointmentId,
    );
    if (existing) {
      await recordEvent(supabase, {
        runId,
        payload,
        directory: null,
        normalizedPhone: normalizePhone(payload.recipientPhone),
        outcome: "skipped_duplicate",
        messageBody: existing.message_body ?? messageBody,
        waMessageId: existing.wa_message_id,
      });
      await completeRun(supabase, runId, "skipped_duplicate");
      return jsonResponse({
        success: true,
        waMessageId: existing.wa_message_id,
        templateName: POST_SERVICE_TEMPLATE_NAME,
        messageBody: existing.message_body ?? messageBody,
        duplicate: true,
      });
    }

    const e164 = normalizeDirectoryPhoneE164(payload.recipientPhone);
    const digits = normalizePhone(payload.recipientPhone);
    if (!e164 || digits.length < 10 || digits.length > 15) {
      normalizedPhone = digits || null;
      return await skipWithEvent(supabase, {
        runId,
        payload,
        directory: null,
        normalizedPhone,
        outcome: "skipped_invalid_phone",
        messageBody,
        error: "Número de teléfono inválido.",
      });
    }
    normalizedPhone = normalizePhone(e164);
    directory = await findDirectoryRecipient(supabase, payload);

    if (directory?.opt_out) {
      return await skipWithEvent(supabase, {
        runId,
        payload,
        directory,
        normalizedPhone,
        outcome: "skipped_opt_out",
        messageBody,
        error: "Contacto en opt-out.",
      });
    }
    if (directory && isPostServiceDirectoryStatusBlocked(directory.status)) {
      return await skipWithEvent(supabase, {
        runId,
        payload,
        directory,
        normalizedPhone,
        outcome: "skipped_status",
        messageBody,
        error: `Estado del contacto no permite envíos: ${directory.status}.`,
      });
    }
    if (directory && !(await isPostServiceEnabled(supabase, directory.id))) {
      return await skipWithEvent(supabase, {
        runId,
        payload,
        directory,
        normalizedPhone,
        outcome: "skipped_disabled",
        messageBody,
        error: "Automatización post-servicio desactivada para el contacto.",
      });
    }
    if (await isRecipientBlocked(supabase, normalizedPhone)) {
      return await skipWithEvent(supabase, {
        runId,
        payload,
        directory,
        normalizedPhone,
        outcome: "skipped_blacklisted",
        messageBody,
        error: "recipient_blocked",
      });
    }

    if (payload.dryRun) {
      await recordEvent(supabase, {
        runId,
        payload,
        directory,
        normalizedPhone,
        outcome: "dry_run",
        messageBody,
      });
      await completeRun(supabase, runId, "dry_run");
      return jsonResponse({
        success: true,
        waMessageId: null,
        templateName: POST_SERVICE_TEMPLATE_NAME,
        messageBody,
      });
    }

    assertMetaSendEnabled();
    const graph = getGraphCredentials();
    const components = buildPostServiceTemplateComponents(
      payload.clientName,
      payload.serviceDate,
    );
    const metaResult = await sendToMeta({
      to: normalizedPhone,
      phoneNumberId: graph.phoneNumberId,
      accessToken: graph.accessToken,
      templateName: POST_SERVICE_TEMPLATE_NAME,
      templateLanguage: POST_SERVICE_TEMPLATE_LANGUAGE,
      templateComponents: components,
      messageBody,
      requirePhone: true,
    });

    const stableKey = getStableKeyFromRecipient(normalizedPhone);
    const recipient = resolveRecipient(normalizedPhone);
    await ensureConversation(
      supabase,
      stableKey,
      normalizedPhone,
      graph.phoneNumberId,
      directory?.display_name ?? directory?.full_name ?? payload.clientName,
    );
    const persisted = await persistOutboundLog(
      supabase,
      {
        conversation_stable_key: stableKey,
        recipient_phone: normalizedPhone,
        recipient_bsuid: recipient.bsuid ?? null,
        direction: "outbound",
        sender_type: "system",
        message_body: messageBody,
        status: metaResult.status,
        wa_message_id: metaResult.waMessageId,
        template_name: POST_SERVICE_TEMPLATE_NAME,
        campaign_type: POST_SERVICE_CAMPAIGN_TYPE,
        phone_number_id: graph.phoneNumberId,
        error_message: metaResult.errorMessage ?? null,
        raw_payload: {
          ...metaResult.payload,
          source: "post_service_automation",
          appointment_id: payload.appointmentData.appointmentId,
          client_id: payload.appointmentData.clientId,
          service_id: payload.appointmentData.serviceId,
          scheduled_date: payload.appointmentData.scheduledDate,
          idempotency_key: payload.idempotencyKey,
        },
      },
      // deno-lint-ignore no-explicit-any
      null as any,
    );
    const createdAt = persisted.createdAt ?? new Date().toISOString();
    await updateConversationPreview(
      supabase,
      stableKey,
      messageBody,
      metaResult.status,
      createdAt,
    );

    if (metaResult.status === "failed") {
      await recordEvent(supabase, {
        runId,
        payload,
        directory,
        normalizedPhone,
        outcome: "failed",
        messageBody,
        errorMessage: metaResult.errorMessage ?? "Meta rechazó el mensaje.",
        waMessageId: metaResult.waMessageId,
      });
      await completeRun(supabase, runId, "failed");
      return jsonResponse({
        success: false,
        error: metaResult.errorMessage ?? "Meta rechazó el mensaje.",
        waMessageId: metaResult.waMessageId,
        templateName: POST_SERVICE_TEMPLATE_NAME,
        messageBody,
      }, 412);
    }

    try {
      await recordEvent(supabase, {
        runId,
        payload,
        directory,
        normalizedPhone,
        outcome: "sent",
        messageBody,
        waMessageId: metaResult.waMessageId,
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const duplicate = await findSentEvent(
        supabase,
        payload.appointmentData.appointmentId,
      );
      await completeRun(supabase, runId, "skipped_duplicate");
      return jsonResponse({
        success: true,
        waMessageId: duplicate?.wa_message_id ?? metaResult.waMessageId,
        templateName: POST_SERVICE_TEMPLATE_NAME,
        messageBody: duplicate?.message_body ?? messageBody,
        duplicate: true,
      });
    }
    await completeRun(supabase, runId, "sent");

    return jsonResponse({
      success: true,
      waMessageId: metaResult.waMessageId,
      templateName: POST_SERVICE_TEMPLATE_NAME,
      messageBody,
    });
  } catch (error) {
    const errorMessage = formatError(error);
    if (runId) {
      try {
        await recordEvent(supabase, {
          runId,
          payload,
          directory,
          normalizedPhone,
          outcome: "failed",
          messageBody,
          errorMessage,
        });
        await completeRun(supabase, runId, "failed");
      } catch (persistenceError) {
        console.error(
          "post-service failure persistence error",
          formatError(persistenceError),
        );
      }
    }
    return jsonResponse({ success: false, error: errorMessage }, 500);
  }
});
