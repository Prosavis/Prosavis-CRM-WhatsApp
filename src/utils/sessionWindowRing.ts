export const SESSION_WINDOW_RING_STROKE = 3;
export const SESSION_WINDOW_RING_PADDING = 4;

export interface SessionWindowRingMetrics {
  outer: number;
  radius: number;
  circumference: number;
  stroke: number;
  center: number;
}

export function sessionWindowRingMetrics(avatarSize: number): SessionWindowRingMetrics {
  const outer = avatarSize + SESSION_WINDOW_RING_PADDING * 2;
  const radius = (outer - SESSION_WINDOW_RING_STROKE) / 2;
  return {
    outer,
    radius,
    circumference: 2 * Math.PI * radius,
    stroke: SESSION_WINDOW_RING_STROKE,
    center: outer / 2,
  };
}

export function sessionWindowRingDashoffset(
  circumference: number,
  remainingRatio: number,
): number {
  const clamped = Number.isFinite(remainingRatio)
    ? Math.min(1, Math.max(0, remainingRatio))
    : 0;
  return circumference * (1 - clamped);
}
