import { assertEquals } from "jsr:@std/assert";
import {
  buildInboundPeriodTotals,
  buildOutboundResponseSemantics,
} from "./metricsSemantics.ts";

Deno.test("buildInboundPeriodTotals deduplicates people across the selected period", () => {
  const totals = buildInboundPeriodTotals(
    [
      {
        conversationStableKey: "contact-new",
        firstContactDay: "2026-09-02",
      },
      {
        conversationStableKey: "contact-new",
        firstContactDay: "2026-09-02",
      },
      {
        conversationStableKey: "contact-existing",
        firstContactDay: "2026-08-15",
      },
      {
        conversationStableKey: null,
        firstContactDay: null,
      },
    ],
    { startDay: "2026-09-01", endDay: "2026-09-07" },
  );

  assertEquals(totals, {
    messagesReceived: 4,
    uniquePeople: 2,
    newPeople: 1,
    existingPeople: 1,
  });
});

Deno.test("buildInboundPeriodTotals treats missing first-contact dates as new", () => {
  const totals = buildInboundPeriodTotals(
    [
      {
        conversationStableKey: "contact-without-directory-date",
        firstContactDay: null,
      },
    ],
    { startDay: "2026-09-01", endDay: "2026-09-07" },
  );

  assertEquals(totals.newPeople, 1);
  assertEquals(totals.existingPeople, 0);
});

Deno.test("buildOutboundResponseSemantics keeps contact rate and diagnoses raw rates above 100", () => {
  const semantics = buildOutboundResponseSemantics({
    sentMessageCount: 2,
    responseMessageCount: 3,
    messagedContactKeys: ["contact-a", "contact-b"],
    respondingContactKeys: [
      "contact-a",
      "contact-a",
      "contact-outside-period-send",
    ],
  });

  assertEquals(semantics, {
    uniqueContactsMessaged: 2,
    uniqueContactsResponded: 1,
    responseRate: 50,
    rawResponseRate: 150,
    responseRateWarning: "RAW_MESSAGE_RESPONSE_RATE_ABOVE_100",
    responseRateDiagnostics: {
      responseRateBasis: "unique_contacts",
      responseRateNumerator: 1,
      responseRateDenominator: 2,
      rawResponseRateBasis: "messages",
      rawResponseRateNumerator: 3,
      rawResponseRateDenominator: 2,
    },
  });
});
