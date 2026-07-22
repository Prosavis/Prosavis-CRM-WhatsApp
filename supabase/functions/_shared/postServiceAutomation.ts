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
