import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  buildAgendaRecoveryAlternatives,
  buildRecoveryJobPlan,
  formatRecoveryWhatsAppScript,
} from "./agendaRecovery.ts";

const baseWindow = {
  id: "candidate-a",
  cleanerId: "cleaner-a",
  cleanerName: "Ana",
  windowStart: "2026-08-07T13:00:00-05:00",
  windowEnd: "2026-08-07T15:00:00-05:00",
  availableMinutes: 120,
  acceptsComposite: true,
};

Deno.test("known price and cost expose margin and allow a single sale", () => {
  const alternatives = buildAgendaRecoveryAlternatives([
    {
      ...baseWindow,
      singlePriceCOP: 150_000,
      pairPriceCOP: null,
      estimatedMarginalCostCOP: 70_000,
    },
  ]);

  assertEquals(alternatives[0], {
    id: "single:candidate-a",
    kind: "single",
    cleanerIds: ["cleaner-a"],
    cleanerNames: ["Ana"],
    windowStart: baseWindow.windowStart,
    windowEnd: baseWindow.windowEnd,
    availableMinutes: 120,
    priceCOP: 150_000,
    estimatedMarginalCostCOP: 70_000,
    contributionMarginCOP: 80_000,
    contributionMarginPercent: 53.33,
    flags: [],
    saleAllowed: true,
    addons: [],
  });
});

Deno.test("unknown prices block sale and never appear in WhatsApp copy", () => {
  const [alternative] = buildAgendaRecoveryAlternatives([
    {
      ...baseWindow,
      singlePriceCOP: null,
      pairPriceCOP: null,
      estimatedMarginalCostCOP: 70_000,
    },
  ]);

  assertEquals(alternative.saleAllowed, false);
  assertEquals(alternative.flags, ["unknown_price"]);
  const script = formatRecoveryWhatsAppScript(
    "Laura",
    "viernes 7 de agosto",
    alternative,
  );
  assertStringIncludes(script, "confirmar la tarifa");
  assertEquals(script.includes("$"), false);
});

Deno.test("a known addon stays blocked when the base alternative is blocked", () => {
  const [alternative] = buildAgendaRecoveryAlternatives([
    {
      ...baseWindow,
      singlePriceCOP: null,
      pairPriceCOP: null,
      estimatedMarginalCostCOP: 70_000,
      addons: [{
        addonId: "inside-fridge",
        label: "Interior de nevera",
        minutes: 30,
        priceCOP: 25_000,
      }],
    },
  ]);

  assertEquals(alternative.saleAllowed, false);
  assertEquals(alternative.addons[0], {
    addonId: "inside-fridge",
    label: "Interior de nevera",
    minutes: 30,
    priceCOP: 25_000,
    saleAllowed: false,
    flags: ["unknown_price"],
  });
});

Deno.test("overlapping composite cleaners produce a priced pair alternative", () => {
  const alternatives = buildAgendaRecoveryAlternatives([
    {
      ...baseWindow,
      singlePriceCOP: null,
      pairPriceCOP: 180_000,
      estimatedMarginalCostCOP: 50_000,
    },
    {
      ...baseWindow,
      id: "candidate-b",
      cleanerId: "cleaner-b",
      cleanerName: "Beatriz",
      windowStart: "2026-08-07T14:00:00-05:00",
      windowEnd: "2026-08-07T16:00:00-05:00",
      singlePriceCOP: null,
      pairPriceCOP: 180_000,
      estimatedMarginalCostCOP: 45_000,
    },
  ]);

  assertEquals(alternatives[2], {
    id: "pair:candidate-a:candidate-b",
    kind: "pair",
    cleanerIds: ["cleaner-a", "cleaner-b"],
    cleanerNames: ["Ana", "Beatriz"],
    windowStart: "2026-08-07T14:00:00-05:00",
    windowEnd: "2026-08-07T15:00:00-05:00",
    availableMinutes: 60,
    priceCOP: 180_000,
    estimatedMarginalCostCOP: 95_000,
    contributionMarginCOP: 85_000,
    contributionMarginPercent: 47.22,
    flags: [],
    saleAllowed: true,
    addons: [],
  });
});

Deno.test("18:00 Bogotá helper targets recoverables for tomorrow", () => {
  assertEquals(
    buildRecoveryJobPlan({
      bogotaDate: "2026-08-06",
      bogotaHour: 17,
    }),
    {
      shouldRun: false,
      operationalDate: "2026-08-07",
      reason: "before_cutoff",
    },
  );
  assertEquals(
    buildRecoveryJobPlan({
      bogotaDate: "2026-08-06",
      bogotaHour: 18,
    }),
    {
      shouldRun: true,
      operationalDate: "2026-08-07",
      reason: "scheduled_recovery",
    },
  );
});
