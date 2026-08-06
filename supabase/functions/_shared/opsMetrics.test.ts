import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  buildCleanerCapacityPayload,
  buildOpsMetricsPayload,
  parseOpsMetricsQuery,
} from "./opsMetrics.ts";

Deno.test(
  "parseOpsMetricsQuery validates and derives equal comparison range",
  () => {
    const parsed = parseOpsMetricsQuery(
      new URL(
        "https://example.test/ops-metrics?serviceId=service-1&from=2026-08-01&to=2026-08-06",
      ),
    );

    assertEquals(parsed, {
      serviceId: "service-1",
      from: "2026-08-01",
      to: "2026-08-06",
      previousFrom: "2026-07-26",
      previousTo: "2026-07-31",
    });
  },
);

Deno.test("parseOpsMetricsQuery rejects malformed or oversized ranges", () => {
  assertThrows(() =>
    parseOpsMetricsQuery(
      new URL(
        "https://example.test/ops-metrics?serviceId=bad/value&from=2026-08-01&to=2026-08-06",
      ),
    ),
  );
  assertThrows(() =>
    parseOpsMetricsQuery(
      new URL(
        "https://example.test/ops-metrics?serviceId=service-1&from=2025-01-01&to=2026-08-06",
      ),
    ),
  );
});

Deno.test(
  "buildOpsMetricsPayload aggregates cards, capacity and comparison",
  () => {
    const payload = buildOpsMetricsPayload(
      [
        {
          operational_date: "2026-08-05",
          bookings_count: 2,
          completed_count: 1,
          sold_minutes: 360,
          offered_minutes: 480,
          accepted_minutes: 480,
          lost_minutes: 0,
          recoverable_minutes: 120,
          billed_cop: 100_000,
          collected_cop: 80_000,
          overdue_cop: 20_000,
          upcoming_cop: 50_000,
          contribution_before_cac_cop: 70_000,
          contribution_after_cac_cop: 60_000,
          cash_margin_cop: 40_000,
        },
        {
          operational_date: "2026-08-06",
          bookings_count: 1,
          completed_count: 1,
          sold_minutes: 120,
          offered_minutes: 240,
          accepted_minutes: 120,
          lost_minutes: 0,
          recoverable_minutes: 0,
          billed_cop: 50_000,
          collected_cop: 50_000,
          overdue_cop: 0,
          upcoming_cop: 0,
          contribution_before_cac_cop: 35_000,
          contribution_after_cac_cop: 30_000,
          cash_margin_cop: 30_000,
        },
      ],
      [
        {
          operational_date: "2026-07-30",
          billed_cop: 100_000,
          collected_cop: 100_000,
        },
      ],
    );

    assertEquals(payload.cards, {
      billedCOP: 150_000,
      collectedCOP: 130_000,
      overdueCOP: 20_000,
      upcomingCOP: 50_000,
    });
    assertEquals(payload.capacity, {
      offeredMinutes: 720,
      acceptedMinutes: 600,
      soldMinutes: 480,
      lostMinutes: 0,
      recoverableMinutes: 120,
      utilization: 0.8,
      equivalentDays: 1,
    });
    assertEquals(payload.comparison.billedCOP, {
      current: 150_000,
      previous: 100_000,
      absoluteChange: 50_000,
      percentChange: 50,
    });
    assertEquals(payload.margin, {
      cashCOP: 70_000,
      contributionBeforeCacCOP: 105_000,
      contributionAfterCacCOP: 90_000,
    });
  },
);

Deno.test("zero accepted minutes stays out of utilization denominator", () => {
  const payload = buildOpsMetricsPayload([
    {
      operational_date: "2026-08-06",
      accepted_minutes: 0,
      sold_minutes: 120,
    },
  ]);
  assertEquals(payload.capacity.utilization, null);
});

Deno.test(
  "buildCleanerCapacityPayload adds member names and stable ordering",
  () => {
    const payload = buildCleanerCapacityPayload(
      [
        {
          cleaner_id: "cleaner-2",
          operational_date: "2026-08-07",
          accepted_minutes: 240,
          sold_minutes: 120,
          recoverable_minutes: 120,
          utilization: 0.5,
        },
        {
          cleaner_id: "cleaner-1",
          operational_date: "2026-08-06",
          accepted_minutes: 480,
          sold_minutes: 480,
          recoverable_minutes: 0,
          utilization: 1,
        },
      ],
      [
        { id: "cleaner-1", name: "Ana" },
        { id: "cleaner-2", name: "Beatriz" },
      ],
    );

    assertEquals(
      payload.map(({ cleaner_id, cleaner_name, operational_date }) => ({
        cleaner_id,
        cleaner_name,
        operational_date,
      })),
      [
        {
          cleaner_id: "cleaner-1",
          cleaner_name: "Ana",
          operational_date: "2026-08-06",
        },
        {
          cleaner_id: "cleaner-2",
          cleaner_name: "Beatriz",
          operational_date: "2026-08-07",
        },
      ],
    );
  },
);
