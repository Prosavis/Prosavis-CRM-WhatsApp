import {
  isRecurringClient,
  type ClassifiableClient,
} from "./clientClassification.ts";

export const POST_SERVICE_TEMPLATE_NAME = "service_finalizado";
export const POST_SERVICE_TEMPLATE_LANGUAGE = "es_CO";
export const POST_SERVICE_CAMPAIGN_TYPE = "POST_SERVICIO";

export interface PostServiceAppointmentData {
  appointmentId: string;
  clientId: string;
  serviceId: string;
  scheduledDate: string;
}

export interface PostServiceFollowUpPayload {
  recipientPhone: string;
  clientName: string;
  serviceDate: string;
  appointmentData: PostServiceAppointmentData;
  idempotencyKey: string;
  dryRun?: boolean;
  runKind?: "primary" | "retry" | "manual" | "dry_run";
  schedulerName?: string;
}

export interface PostServiceTemplateParameter {
  type: "text";
  text: string;
}

export interface PostServiceTemplateComponent {
  type: "body";
  parameters: PostServiceTemplateParameter[];
}

function cleanTemplateValue(value: string, fallback: string): string {
  return value.trim() || fallback;
}

export function buildPostServiceMessageBody(
  clientName: string,
  serviceDate: string,
): string {
  const name = cleanTemplateValue(clientName, "Cliente");
  const date = cleanTemplateValue(serviceDate, "la fecha programada");
  return `Hola ${name}, tu servicio de limpieza del ${date} ha finalizado. Gracias por confiar en Prosavis.\n\n¿Cómo te fue? Cuéntanos por este chat. Si quieres reagendar, responde con el día que necesitas y revisamos disponibilidad.`;
}

export function buildPostServiceTemplateComponents(
  clientName: string,
  serviceDate: string,
): PostServiceTemplateComponent[] {
  const name = cleanTemplateValue(clientName, "Cliente");
  const date = cleanTemplateValue(serviceDate, "la fecha programada");
  return [
    {
      type: "body",
      parameters: [
        {
          type: "text",
          text: name,
        },
        {
          type: "text",
          text: date,
        },
      ],
    },
  ];
}

export function buildPostServiceIdempotencyKey(appointmentId: string): string {
  return `post-service-followup:${appointmentId.trim()}`;
}

const BLOCKED_DIRECTORY_STATUSES = new Set([
  "blocked",
  "disabled",
  "inactive",
  "opt_out",
  "blacklisted",
]);

export function isPostServiceDirectoryStatusBlocked(
  status: string | null | undefined,
): boolean {
  return BLOCKED_DIRECTORY_STATUSES.has((status ?? "").trim().toLowerCase());
}

export type PostServiceRecurringSkipOutcome =
  | "skipped_recurring"
  | "skipped_has_future_booking";

export interface PostServiceRecurringSkipInput extends ClassifiableClient {
  isRecurringSeries: boolean;
  hasFutureBooking: boolean;
}

export function resolvePostServiceRecurringSkip(
  input: PostServiceRecurringSkipInput,
): PostServiceRecurringSkipOutcome | null {
  if (
    isRecurringClient({
      classification: input.classification,
      tags: input.tags,
    })
  ) {
    return "skipped_recurring";
  }
  if (input.isRecurringSeries) {
    return "skipped_recurring";
  }
  if (input.hasFutureBooking) {
    return "skipped_has_future_booking";
  }
  return null;
}

const PHONE_BASED_CLIENT_ID_RE = /^(?:web|mob)_(\d{7,})$/;

export interface PostServicePreferenceEvent {
  directory_id?: string | null;
  outcome?: string;
  postServiceEnabled?: boolean;
}

export interface PostServiceDirectoryLookup {
  byId: Map<string, string>;
  byAppUserId: Map<string, string>;
  byAppointmentId: Map<string, string>;
  byPhoneKey: Map<string, string>;
  byFirestoreDocId: Map<string, string>;
}

export function isPostServicePreferenceEnabled(
  event: PostServicePreferenceEvent,
): boolean {
  if (typeof event.postServiceEnabled === "boolean") {
    return event.postServiceEnabled;
  }
  return event.outcome !== "skipped_disabled";
}

export function applyPostServicePreferences<
  T extends PostServicePreferenceEvent,
>(
  events: T[],
  enabledByDirectoryId: Map<string, boolean>,
): Array<T & { postServiceEnabled: boolean }> {
  return events.map((event) => {
    const directoryId = event.directory_id?.trim() || "";
    const stored = directoryId
      ? enabledByDirectoryId.get(directoryId)
      : undefined;
    return {
      ...event,
      postServiceEnabled: stored !== false,
    };
  });
}

export function phoneKeyFromClientId(clientId: string | null | undefined): string | null {
  const match = (clientId ?? "").trim().match(PHONE_BASED_CLIENT_ID_RE);
  if (!match) return null;
  return match[1].slice(-10);
}

export function resolvePostServiceDirectoryId(
  appointment: {
    appointmentId: string;
    clientId?: string | null;
    clientAppUserId?: string | null;
  },
  lookup: PostServiceDirectoryLookup,
): string | null {
  const clientId = appointment.clientId?.trim() || "";
  const appUserId = appointment.clientAppUserId?.trim() || "";
  if (clientId && lookup.byId.has(clientId)) {
    return lookup.byId.get(clientId) ?? null;
  }
  if (clientId && lookup.byAppUserId.has(clientId)) {
    return lookup.byAppUserId.get(clientId) ?? null;
  }
  if (appUserId && lookup.byAppUserId.has(appUserId)) {
    return lookup.byAppUserId.get(appUserId) ?? null;
  }
  if (clientId && lookup.byFirestoreDocId.has(clientId)) {
    return lookup.byFirestoreDocId.get(clientId) ?? null;
  }
  if (appUserId && lookup.byFirestoreDocId.has(appUserId)) {
    return lookup.byFirestoreDocId.get(appUserId) ?? null;
  }
  const phoneKey = phoneKeyFromClientId(clientId);
  if (phoneKey && lookup.byPhoneKey.has(phoneKey)) {
    return lookup.byPhoneKey.get(phoneKey) ?? null;
  }
  return lookup.byAppointmentId.get(appointment.appointmentId) ?? null;
}
