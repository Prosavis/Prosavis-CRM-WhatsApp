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
