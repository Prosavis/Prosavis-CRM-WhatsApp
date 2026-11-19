export const LOSS_REASONS = [
  'precio',
  'sin_cupo',
  'fuera_de_cobertura',
  'dejo_de_responder',
  'buscaba_empleo',
  'no_se_ofrece',
  'cerro_por_fuera',
  'solo_informandose',
  'otro',
] as const;

export type LossReason = (typeof LOSS_REASONS)[number];

const CLOSED_APPOINTMENT = new Set(['CANCELED', 'REJECTED']);

export const LOSS_REASON_REQUIRED_CODE = 'loss_reason_required';
export const APPOINTMENTS_UNKNOWN_CODE = 'appointments_unknown';

export type ArchiveLossDecision = 'allow' | 'need_reason' | 'appointments_unknown';

/** Misma regla que `salesChatNeedsLossReason`. Firestore solo hace falta si esto no es `allow`. */
export function archiveLossDecision(input: {
  intake: string | null;
  fromAd: boolean;
  lossReason: string | null;
  appointmentsLoadFailed: boolean;
  hasAppointment: boolean;
}): ArchiveLossDecision {
  const needsReasonWithoutAppointment = salesChatNeedsLossReason({
    archiving: true,
    intake: input.intake,
    fromAd: input.fromAd,
    hasAppointment: false,
    lossReason: input.lossReason,
  });
  if (!needsReasonWithoutAppointment) return 'allow';
  if (input.appointmentsLoadFailed) return 'appointments_unknown';
  if (input.hasAppointment) return 'allow';
  return 'need_reason';
}

export function isLossReasonRequiredError(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === 'object'
    && (error as { code?: unknown }).code === LOSS_REASON_REQUIRED_CODE,
  );
}

export function salesChatNeedsLossReason(input: {
  archiving: boolean;
  intake: string | null;
  fromAd: boolean;
  hasAppointment: boolean;
  lossReason: string | null;
}): boolean {
  if (!input.archiving || input.lossReason || input.hasAppointment) return false;
  return input.intake === 'hogar' || input.intake === 'empresas' || input.fromAd;
}

export function phoneHasLiveAppointment(
  phone: string | null | undefined,
  rows: readonly { clientPhone: string | null; status: string | null }[],
): boolean {
  const digits = String(phone ?? '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (last10.length !== 10) return false;
  return rows.some((row) => {
    const rowDigits = String(row.clientPhone ?? '').replace(/\D/g, '');
    return rowDigits.endsWith(last10) && !CLOSED_APPOINTMENT.has(String(row.status ?? ''));
  });
}
