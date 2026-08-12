import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  buildVisitAttentionAlert,
  visitsAlertConfigured,
} from "./visitAttentionAlert.ts";

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

Deno.test("visits alert is unconfigured until every secret is present", () => {
  const previous = new Map<string, string | undefined>();
  const keys = [
    "VISITS_ALERT_PHONE",
    "USER_CONSOLE_URL",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "ENABLE_META_SEND",
  ];
  for (const key of keys) {
    previous.set(key, Deno.env.get(key));
    Deno.env.delete(key);
  }
  try {
    assertEquals(visitsAlertConfigured(), false);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});

Deno.test("visit attention alert requires configured destination", () => {
  assertThrows(() =>
    buildVisitAttentionAlert({
      satisfaction: 2,
      complaintId: "",
      userConsoleUrl: "",
    }),
  );
});
