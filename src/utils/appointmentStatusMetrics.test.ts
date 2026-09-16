import { describe, expect, it } from 'vitest';
import {
  bucketToDateRange,
  completionRate,
  fromCompletedOnlyPoint,
  groupAppointmentStatuses,
  labelAppointmentStatusSeries,
  trimEmptyAppointmentEdges,
} from './appointmentStatusMetrics';

describe('appointmentStatusMetrics', () => {
  it('groups exact statuses without dropping future or canceled bookings', () => {
    const groups = groupAppointmentStatuses({
      pending: 2,
      pendingReschedule: 1,
      confirmed: 3,
      enRoute: 1,
      inProgress: 1,
      completed: 4,
      canceled: 2,
      rejected: 1,
      total: 15,
    });
    expect(groups).toEqual({
      scheduled: 6,
      inProgress: 2,
      completed: 4,
      canceled: 2,
      rejected: 1,
    });
    expect(completionRate({ completed: 4, total: 15 })).toBe(26.7);
  });

  it('keeps a month with zero completed but other statuses in the labeled series', () => {
    const labeled = labelAppointmentStatusSeries(
      [
        {
          bucket: '2026-08',
          pending: 0,
          pendingReschedule: 0,
          confirmed: 0,
          enRoute: 0,
          inProgress: 0,
          completed: 18,
          canceled: 3,
          rejected: 0,
          total: 21,
        },
        {
          bucket: '2026-09',
          pending: 8,
          pendingReschedule: 1,
          confirmed: 5,
          enRoute: 1,
          inProgress: 1,
          completed: 0,
          canceled: 2,
          rejected: 1,
          total: 19,
        },
      ],
      'month',
      '2026-09',
    );
    expect(labeled[1].completed).toBe(0);
    expect(labeled[1].stackedScheduled).toBe(14);
    expect(labeled[1].stackedInProgress).toBe(2);
    expect(labeled[1].total).toBe(19);
    expect(labeled[1].isPartial).toBe(true);
    expect(trimEmptyAppointmentEdges(labeled)).toHaveLength(2);
  });

  it('falls back from completed-only points and maps month buckets to Bogotá ranges', () => {
    expect(fromCompletedOnlyPoint({ bucket: '2026-09-16', completed: 3 })).toMatchObject({
      completed: 3,
      total: 3,
      pending: 0,
    });
    expect(bucketToDateRange('2026-09', 'month')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(bucketToDateRange('2026-09-16', 'day')).toEqual({ from: '2026-09-16', to: '2026-09-16' });
  });
});
