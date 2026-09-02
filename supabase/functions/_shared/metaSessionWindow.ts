export const META_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SESSION_WINDOW_CLOSED_CODE = 'SESSION_WINDOW_CLOSED';
export const SESSION_WINDOW_CLOSED_MESSAGE =
  'La ventana de 24 h está cerrada. Envía una plantilla para volver a escribir.';

export type MetaSessionWindowStatus = 'open' | 'closed' | 'unknown';

export interface MetaSessionWindow {
  status: MetaSessionWindowStatus;
  lastInboundAt: string | null;
  expiresAt: string | null;
  requiresTemplate: boolean;
}

export interface MetaSessionMessage {
  direction?: string | null;
  role?: string | null;
  createdAt?: string | Date | null;
}

type TimestampInput = string | Date | null | undefined;

function timestampMillis(value: TimestampInput): number | null {
  const millis = value instanceof Date ? value.getTime() : new Date(value ?? '').getTime();
  return Number.isFinite(millis) ? millis : null;
}

function unknownWindow(): MetaSessionWindow {
  return {
    status: 'unknown',
    lastInboundAt: null,
    expiresAt: null,
    requiresTemplate: true,
  };
}

export function getMetaSessionWindow(
  lastInboundAt: TimestampInput,
  now: TimestampInput = new Date(),
): MetaSessionWindow {
  const inboundMillis = timestampMillis(lastInboundAt);
  const nowMillis = timestampMillis(now);
  if (inboundMillis == null || nowMillis == null || inboundMillis > nowMillis) {
    return unknownWindow();
  }

  const expiresMillis = inboundMillis + META_SESSION_WINDOW_MS;
  const status: MetaSessionWindowStatus =
    nowMillis < expiresMillis ? 'open' : 'closed';

  return {
    status,
    lastInboundAt: new Date(inboundMillis).toISOString(),
    expiresAt: new Date(expiresMillis).toISOString(),
    requiresTemplate: status !== 'open',
  };
}

export function resolveMetaSessionWindow(params: {
  snapshot?: MetaSessionWindow | null;
  lastInboundAt?: TimestampInput;
  now?: TimestampInput;
}): MetaSessionWindow {
  const snapshotMillis = timestampMillis(params.snapshot?.lastInboundAt);
  const currentInboundMillis = timestampMillis(params.lastInboundAt);
  const newestInboundMillis =
    snapshotMillis == null
      ? currentInboundMillis
      : currentInboundMillis == null
        ? snapshotMillis
        : Math.max(snapshotMillis, currentInboundMillis);

  return getMetaSessionWindow(
    newestInboundMillis == null ? null : new Date(newestInboundMillis),
    params.now,
  );
}

export function buildMetaSessionWindow(
  messages: readonly MetaSessionMessage[],
  now: TimestampInput = new Date(),
): MetaSessionWindow {
  let newestInboundMillis: number | null = null;

  for (const message of messages) {
    const isInbound =
      message.direction === 'inbound' ||
      (message.direction == null && message.role === 'user');
    if (!isInbound) continue;

    const millis = timestampMillis(message.createdAt);
    if (millis == null) continue;
    if (newestInboundMillis == null || millis > newestInboundMillis) {
      newestInboundMillis = millis;
    }
  }

  return newestInboundMillis == null
    ? unknownWindow()
    : getMetaSessionWindow(new Date(newestInboundMillis), now);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function nextLastInboundAt(
  existing: TimestampInput,
  incoming: TimestampInput,
): string | null {
  const existingMs = timestampMillis(existing);
  const incomingMs = timestampMillis(incoming);
  const newest =
    existingMs == null
      ? incomingMs
      : incomingMs == null
        ? existingMs
        : Math.max(existingMs, incomingMs);
  return newest == null ? null : new Date(newest).toISOString();
}

export function newestInboundTimestamp(
  ...values: TimestampInput[]
): Date | null {
  let newest: number | null = null;
  for (const value of values) {
    const ms = timestampMillis(value);
    if (ms == null) continue;
    if (newest == null || ms > newest) newest = ms;
  }
  return newest == null ? null : new Date(newest);
}

export function sessionWindowRemainingMs(
  lastInboundAt: TimestampInput,
  now: TimestampInput = new Date(),
): number | null {
  const window = getMetaSessionWindow(lastInboundAt, now);
  if (window.status === 'unknown' || !window.expiresAt) return null;
  const nowMs = timestampMillis(now);
  const expiresMs = timestampMillis(window.expiresAt);
  if (nowMs == null || expiresMs == null) return null;
  return Math.max(0, expiresMs - nowMs);
}

export function sessionWindowRemainingRatio(
  lastInboundAt: TimestampInput,
  now: TimestampInput = new Date(),
): number | null {
  const remaining = sessionWindowRemainingMs(lastInboundAt, now);
  if (remaining == null) return null;
  return remaining / META_SESSION_WINDOW_MS;
}

export function sessionWindowHue(remainingRatio: number): number {
  return clamp01(remainingRatio) * 120;
}

export function sessionWindowStrokeColor(remainingRatio: number): string {
  return `hsl(${sessionWindowHue(remainingRatio)}, 90%, 42%)`;
}

function formatRemainingDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return '< 1 min';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

export function formatSessionWindowRemainingLabel(
  lastInboundAt: TimestampInput,
  now: TimestampInput = new Date(),
): string {
  const window = getMetaSessionWindow(lastInboundAt, now);
  if (window.status === 'unknown') return 'Desconocida · requiere plantilla';
  if (window.status === 'closed') return 'Cerrada · requiere plantilla';
  return `Abierta · ${formatRemainingDuration(sessionWindowRemainingMs(lastInboundAt, now) ?? 0)}`;
}

export function freeformSendBlockReason(
  lastInboundAt: TimestampInput,
  now: TimestampInput = new Date(),
): string | null {
  return getMetaSessionWindow(lastInboundAt, now).status === 'open'
    ? null
    : SESSION_WINDOW_CLOSED_CODE;
}

export function isSessionComposerLocked(params: {
  isLidThread: boolean;
  sessionWindow: Pick<MetaSessionWindow, 'requiresTemplate'>;
}): boolean {
  return params.isLidThread || params.sessionWindow.requiresTemplate;
}
