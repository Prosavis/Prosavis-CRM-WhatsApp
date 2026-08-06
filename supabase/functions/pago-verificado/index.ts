import { requireAdmin } from "../_shared/adminAuth.ts";
import {
  getFirestoreDocument,
  patchFirestoreDocument,
} from "../_shared/firebaseAdminRest.ts";
import {
  buildManualPaymentPatch,
  parseManualPaymentRequest,
} from "../_shared/manualPaymentVerification.ts";
import {
  strictJsonResponse,
  strictPreflightResponse,
} from "../_shared/strictCors.ts";

const MAX_BODY_BYTES = 16_384;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return strictPreflightResponse(request);
  }
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

  let input;
  try {
    input = parseManualPaymentRequest(await request.json());
  } catch (error) {
    return strictJsonResponse(
      request,
      { error: error instanceof Error ? error.message : "Body inválido." },
      400,
    );
  }

  const appointment = await getFirestoreDocument(
    "appointments",
    input.appointmentId,
  );
  if (!appointment) {
    return strictJsonResponse(request, { error: "Cita no encontrada." }, 404);
  }

  let result;
  try {
    result = buildManualPaymentPatch({
      request: input,
      appointment,
      actor: context.actor,
      now: new Date(),
    });
  } catch (error) {
    return strictJsonResponse(
      request,
      { error: error instanceof Error ? error.message : "Pago inválido." },
      409,
    );
  }

  if (result.duplicate) {
    return strictJsonResponse(request, {
      data: {
        appointmentId: input.appointmentId,
        applied: false,
        reason: "duplicate",
      },
    });
  }

  try {
    await patchFirestoreDocument(
      "appointments",
      input.appointmentId,
      result.patch,
    );
  } catch {
    console.error("[pago-verificado] Firestore patch failed", {
      request_id: crypto.randomUUID(),
      appointment_id: input.appointmentId,
      spec_version: "v5",
      error_type: "firestore_write_error",
    });
    return strictJsonResponse(
      request,
      { error: "No fue posible registrar el pago." },
      502,
    );
  }

  return strictJsonResponse(request, {
    data: {
      appointmentId: input.appointmentId,
      applied: true,
      reason: "verified",
    },
  });
});
