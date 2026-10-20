/**
 * Copia de prosavis-firebase/functions/src/grokOps/cobroLey2300.ts.
 * Si cambia la regla de cobro, cambia las dos.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isColombiaPublicHolidayDateParts } from './colombiaBookingCalendar.ts';
import { isCommercialPhoneNumberId } from './whatsappLines.ts';

const BOGOTA = 'America/Bogota';
const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export const COBRO_GAP_MS = 7 * 24 * 60 * 60 * 1000;

export interface CobroLogRow {
  template_name?: string | null;
  created_at?: string | null;
  status?: string | null;
  phone_number_id?: string | null;
}

export interface CobroLastContact {
  at: Date;
  templateName: string;
  lineLabel: string;
  status?: string | null;
}

export function isCobroTemplateName(templateName: string): boolean {
  return templateName.trim().toLowerCase().startsWith('cobro_');
}

export function cobroStatusCounts(status: string | null | undefined): boolean {
  return String(status ?? '').trim().toLowerCase() !== 'failed';
}

export function cobroLineLabel(phoneNumberId: string | null | undefined): string {
  return isCommercialPhoneNumberId(phoneNumberId) ? '311' : '312';
}

/** Variantes con las que el log puede haber guardado el mismo celular. */
export function cobroPhoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  const variants = new Set<string>();
  if (digits) {
    variants.add(digits);
    variants.add(`+${digits}`);
  }
  if (digits.length >= 10) {
    const national = digits.slice(-10);
    variants.add(national);
    variants.add(`57${national}`);
    variants.add(`+57${national}`);
  }
  return [...variants];
}

interface BogotaClock {
  ymd: string;
  weekday: number;
  minutes: number;
}

function bogotaClock(now: Date): BogotaClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BOGOTA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  const minute = Number(get('minute'));
  const weekday = WEEKDAY[get('weekday')];
  if (weekday === undefined || Number.isNaN(hour) || Number.isNaN(minute)) {
    throw new Error('No se pudo leer la hora en America/Bogota');
  }
  return {
    ymd: `${get('year')}-${get('month')}-${get('day')}`,
    weekday,
    minutes: hour * 60 + minute,
  };
}

export function formatBogotaCobroStamp(at: Date): string {
  const clock = bogotaClock(at);
  const hour = String(Math.floor(clock.minutes / 60)).padStart(2, '0');
  const minute = String(clock.minutes % 60).padStart(2, '0');
  return `${clock.ymd} ${hour}:${minute}`;
}

/** Domingo, festivo o fuera de la franja. Null si el reloj deja enviar. */
export function cobroScheduleBlockReason(now: Date): string | null {
  const clock = bogotaClock(now);
  if (clock.weekday === 0) return 'Cobro bloqueado: domingo.';
  const [year, month, day] = clock.ymd.split('-').map(Number);
  if (isColombiaPublicHolidayDateParts(year, month, day)) {
    return 'Cobro bloqueado: festivo en Colombia.';
  }
  if (clock.weekday === 6) {
    if (clock.minutes < 8 * 60 || clock.minutes > 15 * 60) {
      return 'Cobro bloqueado: sábado solo de 8:00 a 15:00 (America/Bogota).';
    }
    return null;
  }
  if (clock.minutes < 7 * 60 || clock.minutes > 19 * 60) {
    return 'Cobro bloqueado: lunes a viernes solo de 7:00 a 19:00 (America/Bogota).';
  }
  return null;
}

export function cobroGapBlockReason(now: Date, last: CobroLastContact | null): string | null {
  if (!last || !cobroStatusCounts(last.status)) return null;
  if (Number.isNaN(last.at.getTime())) {
    return 'Cobro bloqueado: el cobro anterior no tiene fecha válida.';
  }
  if (now.getTime() - last.at.getTime() >= COBRO_GAP_MS) return null;
  const template = last.templateName.trim() || 'cobro';
  const line = last.lineLabel.trim() || '312';
  return `Cobro bloqueado: ya se envió ${template} por el ${line} el ${formatBogotaCobroStamp(last.at)}. Máximo uno cada 7 días y un solo número.`;
}

/** El primero que cuenta, en el orden recibido (más reciente primero). */
export function pickCountableCobro(rows: CobroLogRow[]): CobroLastContact | null {
  for (const row of rows) {
    if (!cobroStatusCounts(row.status)) continue;
    if (!row.created_at) continue;
    const at = new Date(row.created_at);
    if (Number.isNaN(at.getTime())) continue;
    return {
      at,
      templateName: String(row.template_name ?? '').trim() || 'cobro',
      lineLabel: cobroLineLabel(row.phone_number_id),
      status: row.status,
    };
  }
  return null;
}

export async function rejectCobroTemplate(
  supabase: SupabaseClient | undefined,
  to: string,
  now: Date,
): Promise<void> {
  const schedule = cobroScheduleBlockReason(now);
  if (schedule) throw new Error(schedule);
  if (!supabase) {
    throw new Error('Cobro bloqueado: falta el registro del CRM para validar la frecuencia.');
  }
  const variants = cobroPhoneVariants(to);
  if (variants.length === 0) throw new Error('Cobro bloqueado: número de destino inválido.');
  const since = new Date(now.getTime() - COBRO_GAP_MS).toISOString();
  const { data, error } = await supabase
    .from('whatsapp_message_log')
    .select('template_name, created_at, status, phone_number_id')
    .in('recipient_phone', variants)
    .ilike('template_name', 'cobro_%')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    throw new Error(`Cobro bloqueado: no se pudo leer el historial (${error.message}).`);
  }
  const gap = cobroGapBlockReason(now, pickCountableCobro((data ?? []) as CobroLogRow[]));
  if (gap) throw new Error(gap);
}
