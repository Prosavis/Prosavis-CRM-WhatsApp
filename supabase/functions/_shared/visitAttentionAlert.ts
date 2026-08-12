const VISITS_ALERT_SECRET_KEYS = [
  "VISITS_ALERT_PHONE",
  "USER_CONSOLE_URL",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
] as const;

export function listMissingVisitsAlertSecrets(): string[] {
  const missing: string[] = VISITS_ALERT_SECRET_KEYS.filter(
    (key) => !Deno.env.get(key)?.trim(),
  );
  const enabled =
    Deno.env.get("ENABLE_META_SEND")?.trim().toLowerCase() === "true";
  if (!enabled) missing.push("ENABLE_META_SEND");
  return missing;
}

export function visitsAlertConfigured(): boolean {
  return listMissingVisitsAlertSecrets().length === 0;
}

export function buildVisitAttentionAlert(input: {
  satisfaction: number;
  complaintId: string;
  userConsoleUrl: string;
}): string {
  const baseUrl = input.userConsoleUrl.trim().replace(/\/+$/, "");
  const complaintId = input.complaintId.trim();
  if (!baseUrl || !complaintId) {
    throw new Error("Visit alert configuration is incomplete");
  }
  const score = Math.max(1, Math.min(5, Math.trunc(input.satisfaction)));
  const params = new URLSearchParams({
    tab: "hoy",
    complaintId,
  });
  return `Atención hoy: una visita obtuvo satisfacción ${score}/5. Abrir: ${baseUrl}/crm/visits?${params}`;
}
