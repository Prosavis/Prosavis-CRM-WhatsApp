export interface StageSnapshot {
  stages: Record<string, number>;
  extras: Record<string, Record<string, unknown>>;
  totalMs: number;
}

export interface StageTimer {
  measure<T>(
    name: string,
    work: () => Promise<T>,
    extra?: Record<string, unknown> | (() => Record<string, unknown>),
  ): Promise<T>;
  record(name: string, ms: number, extra?: Record<string, unknown>): void;
  snapshot(): StageSnapshot;
  log(scope?: string): StageSnapshot;
}

export function createStageTimer(now: () => number = Date.now): StageTimer {
  const started = now();
  const stages: Record<string, number> = {};
  const extras: Record<string, Record<string, unknown>> = {};

  const timer: StageTimer = {
    async measure(name, work, extra) {
      const began = now();
      try {
        return await work();
      } finally {
        const resolved = typeof extra === 'function' ? extra() : extra;
        timer.record(name, now() - began, resolved);
      }
    },
    record(name, ms, extra) {
      stages[name] = ms;
      if (extra) extras[name] = { ...extras[name], ...extra };
    },
    snapshot() {
      return {
        stages: { ...stages },
        extras: { ...extras },
        totalMs: now() - started,
      };
    },
    log(scope = 'suggest-timing') {
      const snap = timer.snapshot();
      console.log(JSON.stringify({
        scope,
        event: 'timing',
        stages: snap.stages,
        extras: snap.extras,
        total: snap.totalMs,
      }));
      return snap;
    },
  };

  return timer;
}

/** Rank más cercano. p=50 y n impar cae en la mediana. */
export function percentileNearestRank(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))];
}
