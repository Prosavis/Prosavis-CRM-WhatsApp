export const META_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

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
