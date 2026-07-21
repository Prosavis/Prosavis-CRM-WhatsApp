/**
 * Espejo de computeNextSendAt / nextSchedulerRunAt del worker Deno
 * (supabase/functions/_shared/reactivationCadence.ts) para tests y UI helpers.
 */

export type ReactivationRowStatusForSend =
  | 'due'
  | 'waiting'
  | 'paused_reply'
  | 'disabled'
  | 'opt_out'
  | 'completed'
  | 'stale'
  | 'active_again'
  | 'eligible';

const STEPS = [
  { step: 1, gapDaysFromPrevious: 0 },
  { step: 2, gapDaysFromPrevious: 7 },
  { step: 3, gapDaysFromPrevious: 7 },
  { step: 4, gapDaysFromPrevious: 14 },
  { step: 5, gapDaysFromPrevious: 28 },
  { step: 6, gapDaysFromPrevious: 28 },
];

const NO_SEND_STATUSES: ReadonlySet<ReactivationRowStatusForSend> = new Set([
  'opt_out',
  'disabled',
  'paused_reply',
  'completed',
  'stale',
  'active_again',
]);

function nextStepNumber(currentStep: number): number | null {
  if (currentStep < 1) return 1;
  if (currentStep >= 6) return null;
  return currentStep + 1;
}

function daysSinceIso(iso: string | null | undefined, asOf: Date): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((asOf.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
}

function resolveDueStep(params: {
  sequenceStep: number;
  lastContactAt: string | null;
  asOf: Date;
}): number | null {
  const next = nextStepNumber(params.sequenceStep);
  if (!next) return null;
  const def = STEPS.find((s) => s.step === next);
  if (!def) return null;
  if (next === 1) return 1;
  const days = daysSinceIso(params.lastContactAt, params.asOf);
  if (days == null) return next;
  if (days >= def.gapDaysFromPrevious) return next;
  return null;
}

export function nextSchedulerRunAt(now = new Date()): string {
  const bogotaOffsetMs = -5 * 60 * 60 * 1000;
  const bogotaNow = new Date(now.getTime() + bogotaOffsetMs);
  const y = bogotaNow.getUTCFullYear();
  const m = bogotaNow.getUTCMonth();
  const d = bogotaNow.getUTCDate();
  const hour = bogotaNow.getUTCHours();
  let targetBogota = new Date(Date.UTC(y, m, d, 12, 0, 0));
  if (hour >= 12) {
    targetBogota = new Date(Date.UTC(y, m, d + 1, 12, 0, 0));
  }
  return new Date(targetBogota.getTime() - bogotaOffsetMs).toISOString();
}

export function computeNextSendAt(params: {
  sequenceStep: number;
  lastContactAt: string | null;
  status: ReactivationRowStatusForSend;
  asOf?: Date;
}): string | null {
  const asOf = params.asOf ?? new Date();
  if (NO_SEND_STATUSES.has(params.status)) return null;

  if (params.status === 'due' || params.status === 'eligible') {
    return nextSchedulerRunAt(asOf);
  }

  if (params.status !== 'waiting') return null;

  const next = nextStepNumber(params.sequenceStep);
  if (!next) return null;

  let candidate = new Date(nextSchedulerRunAt(asOf));
  for (let i = 0; i < 90; i++) {
    const due = resolveDueStep({
      sequenceStep: params.sequenceStep,
      lastContactAt: params.lastContactAt,
      asOf: candidate,
    });
    if (due) return candidate.toISOString();
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  return null;
}
