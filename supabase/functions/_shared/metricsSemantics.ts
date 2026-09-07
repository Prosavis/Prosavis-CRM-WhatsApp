export interface InboundTotals {
  messagesReceived: number;
  uniquePeople: number;
  newPeople: number;
  existingPeople: number;
}

export interface InboundPeriodObservation {
  conversationStableKey: string | null;
  firstContactDay: string | null;
}

export interface SelectedPeriod {
  startDay: string;
  endDay: string;
}

export type ResponseRateWarning = "RAW_MESSAGE_RESPONSE_RATE_ABOVE_100";

export interface ResponseRateDiagnostics {
  responseRateBasis: "unique_contacts";
  responseRateNumerator: number;
  responseRateDenominator: number;
  rawResponseRateBasis: "messages";
  rawResponseRateNumerator: number;
  rawResponseRateDenominator: number;
}

export interface OutboundResponseSemantics {
  uniqueContactsMessaged: number;
  uniqueContactsResponded: number;
  responseRate: number;
  rawResponseRate: number;
  responseRateWarning: ResponseRateWarning | null;
  responseRateDiagnostics: ResponseRateDiagnostics;
}

export interface OutboundResponseInput {
  sentMessageCount: number;
  responseMessageCount: number;
  messagedContactKeys: Iterable<string>;
  respondingContactKeys: Iterable<string>;
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function buildInboundPeriodTotals(
  observations: readonly InboundPeriodObservation[],
  period: SelectedPeriod,
): InboundTotals {
  const people = new Set<string>();
  const newPeople = new Set<string>();
  const existingPeople = new Set<string>();

  for (const observation of observations) {
    const stableKey = observation.conversationStableKey;
    if (!stableKey || people.has(stableKey)) continue;
    people.add(stableKey);

    const firstDay = observation.firstContactDay;
    const joinedDuringPeriod = firstDay === null ||
      (firstDay >= period.startDay && firstDay <= period.endDay);
    if (joinedDuringPeriod) {
      newPeople.add(stableKey);
    } else {
      existingPeople.add(stableKey);
    }
  }

  return {
    messagesReceived: observations.length,
    uniquePeople: people.size,
    newPeople: newPeople.size,
    existingPeople: existingPeople.size,
  };
}

export function buildOutboundResponseSemantics(
  input: OutboundResponseInput,
): OutboundResponseSemantics {
  const messagedContacts = new Set(input.messagedContactKeys);
  const respondingContacts = new Set(input.respondingContactKeys);
  let respondedAndContacted = 0;

  for (const key of respondingContacts) {
    if (messagedContacts.has(key)) respondedAndContacted += 1;
  }

  const responseRate = percentage(respondedAndContacted, messagedContacts.size);
  const rawResponseRate = percentage(
    input.responseMessageCount,
    input.sentMessageCount,
  );

  return {
    uniqueContactsMessaged: messagedContacts.size,
    uniqueContactsResponded: respondedAndContacted,
    responseRate,
    rawResponseRate,
    responseRateWarning: rawResponseRate > 100
      ? "RAW_MESSAGE_RESPONSE_RATE_ABOVE_100"
      : null,
    responseRateDiagnostics: {
      responseRateBasis: "unique_contacts",
      responseRateNumerator: respondedAndContacted,
      responseRateDenominator: messagedContacts.size,
      rawResponseRateBasis: "messages",
      rawResponseRateNumerator: input.responseMessageCount,
      rawResponseRateDenominator: input.sentMessageCount,
    },
  };
}
