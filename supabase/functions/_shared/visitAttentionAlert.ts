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
