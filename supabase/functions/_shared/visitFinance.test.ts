import { assertEquals } from "jsr:@std/assert";
import { presentVisitPayment } from "./visitFinance.ts";

Deno.test("presentVisitPayment never leaks a raw pending status", () => {
  const presented = presentVisitPayment({
    outstandingTotalCOP: 88000,
    rawStatus: "pending",
  });
  assertEquals(presented.headline, "COBRO_PENDIENTE");
  assertEquals(presented.headlineLabel, "Cobro pendiente");
});

Deno.test("presentVisitPayment treats zero debt as al día", () => {
  const presented = presentVisitPayment({
    outstandingTotalCOP: 0,
    rawStatus: "pending",
  });
  assertEquals(presented.headline, "AL_DIA");
});
