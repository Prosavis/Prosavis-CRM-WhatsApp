import { assertEquals } from 'jsr:@std/assert';
import {
  assembleInboundTimeseries,
  buildInboundWindowTotals,
  completedTotalsForRange,
  inboundTotalsForRange,
  rollupOutboundFacts,
  selectInboundWindow,
  selectOutboundWindow,
  windowRange,
} from './metricsWindows.ts';

const TODAY = '2026-09-16';

Deno.test('inbound window totals use distinct people, not the daily sum', () => {
  const rows = [
    { bucket_day: '2026-09-01', stable_key: 'a', first_contact_day: '2026-09-01', messages: 2 },
    { bucket_day: '2026-09-10', stable_key: 'a', first_contact_day: '2026-09-01', messages: 1 },
    { bucket_day: '2026-09-10', stable_key: 'b', first_contact_day: '2026-09-10', messages: 3 },
    { bucket_day: '2026-08-01', stable_key: 'c', first_contact_day: '2026-08-01', messages: 4 },
  ];
  const last30 = inboundTotalsForRange(rows, windowRange(30, TODAY));
  assertEquals(last30.messagesReceived, 6);
  assertEquals(last30.uniquePeople, 2);
  assertEquals(last30.newPeople, 2);
  assertEquals(last30.existingPeople, 0);

  const all = buildInboundWindowTotals(rows, TODAY).all;
  assertEquals(all.uniquePeople, 3);
  assertEquals(all.messagesReceived, 10);
});

Deno.test('timeseries keeps per-day unique people', () => {
  const series = assembleInboundTimeseries([
    { bucket_day: '2026-09-16', stable_key: 'a', first_contact_day: '2026-09-16', messages: 2 },
    { bucket_day: '2026-09-16', stable_key: 'b', first_contact_day: '2026-08-01', messages: 1 },
  ], TODAY);
  const day = series.day.find((point) => point.bucket === TODAY);
  assertEquals(day?.messagesReceived, 3);
  assertEquals(day?.uniquePeople, 2);
  assertEquals(day?.newPeople, 1);
  assertEquals(day?.existingPeople, 1);
});

Deno.test('outbound facts roll up locally without refetching', () => {
  const facts = [
    { bucket: '2026-09-16', campaignType: 'PROMO', templateName: 'hola', status: 'read', messageCount: 2 },
    { bucket: '2026-08-01', campaignType: 'PROMO', templateName: 'hola', status: 'sent', messageCount: 5 },
    { bucket: '2026-09-10', campaignType: 'OTHER', templateName: null, status: 'failed', messageCount: 1 },
  ];
  const last30 = rollupOutboundFacts(facts, windowRange(30, TODAY));
  assertEquals(last30.totals.sent, 2);
  assertEquals(last30.totals.failed, 1);
  assertEquals(last30.byCampaign.PROMO.sent, 2);
  assertEquals(last30.byKind.session.failed, 1);
});

Deno.test('selectInboundWindow only reads bootstrap fields', () => {
  const bootstrap = {
    today: TODAY,
    inboundTimeseries: {
      day: [
        { bucket: '2026-09-16', messagesReceived: 2, uniquePeople: 1, newPeople: 1, existingPeople: 0 },
        { bucket: '2026-08-01', messagesReceived: 9, uniquePeople: 4, newPeople: 4, existingPeople: 0 },
      ],
      week: [],
      month: [],
    },
    inboundWindowTotals: {
      '7': { messagesReceived: 2, uniquePeople: 1, newPeople: 1, existingPeople: 0 },
      '14': { messagesReceived: 2, uniquePeople: 1, newPeople: 1, existingPeople: 0 },
      '30': { messagesReceived: 2, uniquePeople: 1, newPeople: 1, existingPeople: 0 },
      '60': { messagesReceived: 11, uniquePeople: 5, newPeople: 5, existingPeople: 0 },
      '90': { messagesReceived: 11, uniquePeople: 5, newPeople: 5, existingPeople: 0 },
      all: { messagesReceived: 11, uniquePeople: 5, newPeople: 5, existingPeople: 0 },
    },
  };
  const selected = selectInboundWindow(bootstrap, 30);
  assertEquals(selected.totals.uniquePeople, 1);
  assertEquals(selected.series.day.map((point) => point.bucket), [TODAY]);
});

Deno.test('completed totals filter locally', () => {
  const daily = [
    { bucket: '2026-09-16', completed: 2 },
    { bucket: '2026-08-01', completed: 4 },
  ];
  assertEquals(completedTotalsForRange(daily, windowRange(30, TODAY)), 2);
  assertEquals(completedTotalsForRange(daily, null), 6);
});

Deno.test('selectOutboundWindow uses precomputed totals for the chosen span', () => {
  const selected = selectOutboundWindow({
    today: TODAY,
    outboundFacts: [],
    byCampaign: {},
    byTemplate: {},
    byKind: {
      session: { sent: 0, delivered: 0, read: 0, failed: 0, outboundOk: 0, total: 0 },
      template: { sent: 0, delivered: 0, read: 0, failed: 0, outboundOk: 0, total: 0 },
    },
    outboundWindowTotals: {
      '7': { sent: 1, delivered: 0, read: 1, failed: 0, reachedDevice: 1, responses: 0, uniqueMessaged: 1, uniqueResponded: 0, responseRate: 0, rawResponseRate: 0 },
      '14': { sent: 1, delivered: 0, read: 1, failed: 0, reachedDevice: 1, responses: 0, uniqueMessaged: 1, uniqueResponded: 0, responseRate: 0, rawResponseRate: 0 },
      '30': { sent: 3, delivered: 1, read: 1, failed: 0, reachedDevice: 2, responses: 1, uniqueMessaged: 2, uniqueResponded: 1, responseRate: 50, rawResponseRate: 33.3 },
      '60': { sent: 3, delivered: 1, read: 1, failed: 0, reachedDevice: 2, responses: 1, uniqueMessaged: 2, uniqueResponded: 1, responseRate: 50, rawResponseRate: 33.3 },
      '90': { sent: 3, delivered: 1, read: 1, failed: 0, reachedDevice: 2, responses: 1, uniqueMessaged: 2, uniqueResponded: 1, responseRate: 50, rawResponseRate: 33.3 },
      all: { sent: 9, delivered: 2, read: 2, failed: 1, reachedDevice: 4, responses: 4, uniqueMessaged: 6, uniqueResponded: 3, responseRate: 50, rawResponseRate: 44.4 },
    },
  }, 30);
  assertEquals(selected.totals.sent, 3);
  assertEquals(selected.totals.uniqueResponded, 1);
});
