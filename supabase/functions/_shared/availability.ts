import { postFirebaseJson } from './firebaseHttp.ts';
import { INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET } from './inboxAiContextFormat.ts';

const BOGOTA_TIME_ZONE = 'America/Bogota';
const OFFICIAL_DURATIONS = new Set([120, 180, 240, 360, 480]);
const DEFAULT_DURATION_MINUTES = 240;
const REAL_AVAILABILITY_HEADING =
  '=== Disponibilidad real (próximos días) ===';
const HISTORY_HEADING = '=== Historial WhatsApp ===';
const HISTORY_CLIP_MARKER =
  '\n[Historial recortado para disponibilidad real]\n';

export interface FirebaseAvailabilityRequest {
  startDate: string;
  endDate: string;
  duration: number;
}

export interface AvailabilityLoadOptions {
  now?: Date;
  request?: (body: FirebaseAvailabilityRequest) => Promise<unknown>;
}

function bogotaDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function addDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getBogotaAvailabilityHorizon(
  now = new Date(),
): { startDate: string; endDate: string } {
  const startDate = bogotaDateKey(now);
  return {
    startDate,
    endDate: addDays(startDate, 6),
  };
}

export function resolveOfficialDuration(value: unknown): number {
  return typeof value === 'number' &&
      Number.isInteger(value) &&
      OFFICIAL_DURATIONS.has(value)
    ? value
    : DEFAULT_DURATION_MINUTES;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalIsoDateTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value.includes('T')) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function normalizeAvailabilitySlots(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.slots)) return [];
  const slots = new Set<string>();
  for (const value of payload.slots) {
    const canonical = canonicalIsoDateTime(value);
    if (canonical) slots.add(canonical);
  }
  return [...slots].sort((left, right) => left.localeCompare(right));
}

export async function loadRealAvailability(
  duration: unknown,
  options: AvailabilityLoadOptions = {},
): Promise<string[]> {
  const request = options.request ?? postFirebaseJson;
  const horizon = getBogotaAvailabilityHorizon(options.now);
  try {
    const payload = await request({
      ...horizon,
      duration: resolveOfficialDuration(duration),
    });
    return normalizeAvailabilitySlots(payload);
  } catch (error) {
    console.warn(JSON.stringify({
      scope: 'booking-availability',
      event: 'firebase-availability-degraded',
      error: error instanceof Error ? error.message : String(error),
    }));
    return [];
  }
}

export function overwriteBookingAvailability<T extends object>(
  bookingContext: T,
  slots: string[],
): T & { availableSlots: string[] } {
  return {
    ...bookingContext,
    availableSlots: [...slots],
  };
}

function formatRealAvailabilitySection(slots: string[]): string {
  const normalized = normalizeAvailabilitySlots({ slots });
  return [
    REAL_AVAILABILITY_HEADING,
    ...(normalized.length
      ? normalized.map((slot) => `- ${slot}`)
      : ['- Sin horarios reales disponibles.']),
  ].join('\n');
}

function clipBaseContext(baseContext: string, budget: number): string {
  if (baseContext.length <= budget) return baseContext;
  const historyStart = baseContext.indexOf(HISTORY_HEADING);
  if (historyStart < 0) return baseContext.slice(0, budget);

  const prefixEnd = historyStart + HISTORY_HEADING.length;
  const prefix = baseContext.slice(0, prefixEnd);
  const latestBudget = budget - prefix.length - HISTORY_CLIP_MARKER.length;
  if (latestBudget <= 0) return baseContext.slice(0, budget);
  return `${prefix}${HISTORY_CLIP_MARKER}${baseContext.slice(-latestBudget)}`;
}

export function appendRealAvailabilityContext(
  baseContext: string,
  slots: string[],
  totalBudget = INBOX_AI_CONTEXT_TOTAL_CHAR_BUDGET,
): string {
  const section = formatRealAvailabilitySection(slots);
  const separator = baseContext ? '\n\n' : '';
  const baseBudget = Math.max(0, totalBudget - separator.length - section.length);
  const clippedBase = clipBaseContext(baseContext, baseBudget);
  return `${clippedBase}${clippedBase ? separator : ''}${section}`.slice(0, totalBudget);
}
