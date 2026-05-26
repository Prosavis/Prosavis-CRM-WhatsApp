export function parseServiceSubcollectionPath(
  path: string,
  subcollection: string
): { serviceId: string; id: string } | null {
  const pattern = new RegExp(`^services/([^/]+)/${subcollection}/([^/]+)$`);
  const match = path.match(pattern);
  if (!match) return null;
  return { serviceId: match[1], id: match[2] };
}

export function parseAutomationExecutionPath(
  path: string
): { serviceId: string; automationId: string; appointmentId: string } | null {
  const match = path.match(/^services\/([^/]+)\/automations\/([^/]+)\/executions\/([^/]+)$/);
  if (!match) return null;
  return {
    serviceId: match[1],
    automationId: match[2],
    appointmentId: match[3],
  };
}
