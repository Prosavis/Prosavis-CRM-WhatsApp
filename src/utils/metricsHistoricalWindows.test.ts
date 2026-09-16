import { describe, expect, it, vi } from 'vitest';
import type { WhatsAppMetrics } from '@/types/whatsapp';
import {
  applyOutboundWindow,
  filterHeatmapPoints,
  selectAppointmentStatusWindow,
  selectCompletedWindow,
  selectInboundWindow,
} from './metricsHistoricalWindows';

const metrics = {
  today: '2026-09-16',
  period: { from: '2025-01-01', to: '2026-09-16' },
  inboundTotals: { uniquePeople: 200, newPeople: 40, messagesReceived: 900 },
  inboundWindowTotals: {
    '7': { uniquePeople: 20, newPeople: 4, messagesReceived: 70 },
    '30': { uniquePeople: 80, newPeople: 16, messagesReceived: 300 },
    all: { uniquePeople: 200, newPeople: 40, messagesReceived: 900 },
  },
  inboundTimeseries: {
    day: [
      { bucket: '2026-09-10', uniquePeople: 8, newPeople: 1, messagesReceived: 20 },
      { bucket: '2026-09-16', uniquePeople: 5, newPeople: 1, messagesReceived: 12 },
    ],
    week: [],
    month: [],
  },
  completedDaily: [
    { bucket: '2026-08-01', completed: 12 },
    { bucket: '2026-09-16', completed: 3 },
  ],
  appointmentDaily: [
    {
      bucket: '2026-08-01',
      pending: 0,
      pendingReschedule: 0,
      confirmed: 1,
      enRoute: 0,
      inProgress: 0,
      completed: 12,
      canceled: 2,
      rejected: 0,
      total: 15,
    },
    {
      bucket: '2026-09-16',
      pending: 2,
      pendingReschedule: 0,
      confirmed: 1,
      enRoute: 0,
      inProgress: 1,
      completed: 3,
      canceled: 1,
      rejected: 0,
      total: 8,
    },
  ],
  completedWindowTotals: { '7': 3, '30': 18, all: 337 },
  completedServicesTimeseries: { day: [], week: [], month: [] },
  totalSent: 420,
  outboundWindowTotals: {
    '30': {
      sent: 90,
      delivered: 80,
      read: 40,
      failed: 4,
      reachedDevice: 80,
      responses: 20,
      uniqueMessaged: 60,
      uniqueResponded: 18,
      responseRate: 30,
      rawResponseRate: 22,
    },
  },
  outboundTotals: {
    messageCounts: {
      sent: 420,
      delivered: 380,
      read: 200,
      reachedDevice: 380,
      failed: 40,
      responsesReceived: 72,
    },
    uniqueContacts: { messaged: 207, responded: 72 },
  },
} as unknown as WhatsAppMetrics;

describe('metricsHistoricalWindows', () => {
  it('recalculates inbound, completed and outbound windows without fetching', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    expect(selectInboundWindow(metrics, 7).totals.uniquePeople).toBe(20);
    expect(selectInboundWindow(metrics, 7).series.day).toHaveLength(2);
    expect(selectCompletedWindow(metrics, 7).total).toBe(3);
    expect(selectAppointmentStatusWindow(metrics, 7).totals.total).toBe(8);
    expect(selectAppointmentStatusWindow(metrics, 7).groups.scheduled).toBe(3);
    expect(applyOutboundWindow(metrics, 30).totalSent).toBe(90);
    expect(applyOutboundWindow(metrics, 30).outboundTotals.uniqueContacts.messaged).toBe(60);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('filters heatmap points locally by Bogotá day window', () => {
    const points = [
      { id: 'old', scheduledStart: '2026-08-01T14:00:00.000Z' },
      { id: 'recent', scheduledStart: '2026-09-16T14:00:00.000Z' },
    ];
    expect(filterHeatmapPoints(points, 7, '2026-09-16').map((point) => point.id)).toEqual(['recent']);
    expect(filterHeatmapPoints(points, 'all', '2026-09-16')).toHaveLength(2);
  });
});
