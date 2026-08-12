import { assertEquals } from "jsr:@std/assert";
import { buildOpsV5Activation } from "./opsV5Readiness.ts";

Deno.test("suggestion pilot is ready while commercial and payroll stay human decisions", () => {
  const activation = buildOpsV5Activation({
    automationLevel: 1,
    visitsAlertConfigured: false,
    payrollConfigActive: false,
    missingCommercialEnv: ["OPS_V5_LABOR_HOURLY_COP"],
  });

  assertEquals(activation.readyForSuggestionPilot, true);
  assertEquals(activation.suggestionMode, true);
  assertEquals(
    activation.blockingDecisions.map((decision) => [
      decision.id,
      decision.ready,
    ]),
    [
      ["commercial-labor", false],
      ["payroll-oscar", false],
      ["visits-waba", false],
      ["automation-2-3", false],
    ],
  );
});
