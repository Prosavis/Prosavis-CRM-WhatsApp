import { assertEquals, assertThrows } from "jsr:@std/assert";
import { buildVisitAttentionAlert } from "./visitAttentionAlert.ts";

Deno.test(
  "visit attention alert contains a deep link without client PII",
  () => {
    assertEquals(
      buildVisitAttentionAlert({
        satisfaction: 1,
        complaintId: "complaint-1",
        userConsoleUrl: "https://console.example.test/",
      }),
      "Atención hoy: una visita obtuvo satisfacción 1/5. Abrir: https://console.example.test/crm/visits?tab=hoy&complaintId=complaint-1",
    );
  },
);

Deno.test("visit attention alert requires configured destination", () => {
  assertThrows(() =>
    buildVisitAttentionAlert({
      satisfaction: 2,
      complaintId: "",
      userConsoleUrl: "",
    }),
  );
});
