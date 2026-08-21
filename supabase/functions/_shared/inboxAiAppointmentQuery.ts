import type { InboxAiAppointment } from './inboxAiContextFormat.ts';

export const INBOX_AI_APPOINTMENT_QUERY_LIMIT = 40;
export const INBOX_AI_APPOINTMENT_LOOKBACK_MONTHS = 18;

export function appointmentLookbackIso(now = new Date()): string {
  const lookback = new Date(now);
  lookback.setMonth(lookback.getMonth() - INBOX_AI_APPOINTMENT_LOOKBACK_MONTHS);
  return lookback.toISOString();
}

export function buildInboxAiClientIdAppointmentQuery(
  fieldPath: string,
  stringValue: string,
  lookbackIso: string,
): Record<string, unknown> {
  return {
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          {
            fieldFilter: {
              field: { fieldPath },
              op: 'EQUAL',
              value: { stringValue },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: 'scheduledDate' },
              op: 'GREATER_THAN_OR_EQUAL',
              value: { timestampValue: lookbackIso },
            },
          },
        ],
      },
    },
    orderBy: [{ field: { fieldPath: 'scheduledDate' }, direction: 'ASCENDING' }],
    limit: INBOX_AI_APPOINTMENT_QUERY_LIMIT,
  };
}

export function buildInboxAiClientPhoneAppointmentQuery(
  fieldPath: string,
  stringValue: string,
): Record<string, unknown> {
  return {
    where: {
      fieldFilter: {
        field: { fieldPath },
        op: 'EQUAL',
        value: { stringValue },
      },
    },
    limit: INBOX_AI_APPOINTMENT_QUERY_LIMIT,
  };
}

export function filterAppointmentsByLookback(
  appointments: InboxAiAppointment[],
  lookbackIso: string,
): InboxAiAppointment[] {
  const lookbackMs = new Date(lookbackIso).getTime();
  if (!Number.isFinite(lookbackMs)) return appointments;
  return appointments.filter((appointment) => {
    const scheduledMs = new Date(appointment.scheduledDate).getTime();
    return Number.isFinite(scheduledMs) && scheduledMs >= lookbackMs;
  });
}
