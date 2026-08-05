import { useEffect, useMemo, useState } from 'react';
import {
  resolveMetaSessionWindow,
  type MetaSessionWindow,
} from '../../supabase/functions/_shared/metaSessionWindow';

export function scheduleMetaSessionExpiry(
  expiresAt: string,
  onExpire: () => void,
): () => void {
  const expiresMillis = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresMillis)) return () => {};

  const timeout = globalThis.setTimeout(
    onExpire,
    Math.max(0, expiresMillis - Date.now()),
  );
  return () => globalThis.clearTimeout(timeout);
}

export function useMetaSessionWindow(
  snapshot: MetaSessionWindow | null | undefined,
  lastInboundAt: Date | null | undefined,
): MetaSessionWindow {
  const snapshotInboundAt = snapshot?.lastInboundAt ?? null;
  const currentInboundAt =
    lastInboundAt && Number.isFinite(lastInboundAt.getTime())
      ? lastInboundAt.toISOString()
      : null;
  const [nowMillis, setNowMillis] = useState(() => Date.now());
  const newestInboundMillis = Math.max(
    new Date(snapshotInboundAt ?? '').getTime() || 0,
    new Date(currentInboundAt ?? '').getTime() || 0,
  );
  const evaluationNowMillis = Math.max(nowMillis, newestInboundMillis);

  useEffect(() => {
    setNowMillis(Date.now());
  }, [currentInboundAt, snapshotInboundAt]);

  const resolved = useMemo(
    () =>
      resolveMetaSessionWindow({
        snapshot,
        lastInboundAt: currentInboundAt,
        now: new Date(evaluationNowMillis),
      }),
    [currentInboundAt, evaluationNowMillis, snapshot],
  );

  useEffect(() => {
    if (resolved.status !== 'open' || !resolved.expiresAt) return;

    return scheduleMetaSessionExpiry(
      resolved.expiresAt,
      () => setNowMillis(Date.now()),
    );
  }, [resolved.expiresAt, resolved.status]);

  return resolved;
}
