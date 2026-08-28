export const INBOX_PERF_MARKS = {
  listReady: 'inbox:list-ready',
  chatReady: 'inbox:chat-ready',
  sendOptimistic: 'inbox:send-optimistic',
  sendAck: 'inbox:send-ack',
} as const;

export type InboxPerfMark = (typeof INBOX_PERF_MARKS)[keyof typeof INBOX_PERF_MARKS];

export function markInboxPerf(name: InboxPerfMark): void {
  if (typeof performance === 'undefined' || typeof performance.mark !== 'function') return;
  try {
    performance.mark(name);
  } catch {
    // duplicate marks are fine to ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('inbox-perf-mark', {
        detail: { name, t: performance.now() },
      }),
    );
  }
}

export function measureInboxPerf(name: string, startMark: InboxPerfMark): number | null {
  if (typeof performance === 'undefined' || typeof performance.measure !== 'function') return null;
  try {
    const measure = performance.measure(name, startMark);
    return measure.duration;
  } catch {
    return null;
  }
}
