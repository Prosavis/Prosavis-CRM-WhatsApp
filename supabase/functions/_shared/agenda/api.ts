import type {
  AgendaComplianceConfig,
  AgendaEngineWeights,
  AgendaRequest,
  MarginalCostConfig,
  TravelConfig,
  TravelLocation,
} from "./types.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const LOST_REQUEST_REASONS = [
  "sin_capacidad",
  "fuera_de_zona",
  "cliente_no_acepto_alternativa",
  "precio",
  "no_respondio",
  "otro",
] as const;

export type LostRequestReason = typeof LOST_REQUEST_REASONS[number];

export interface AgendaOptionsApiRequest {
  serviceId: string;
  appointmentId?: string;
  buildingId?: string;
  clientId?: string;
  tier: string;
  request: AgendaRequest;
}

export interface AgendaLostApiRequest {
  serviceId: string;
  requestId: string;
  requestedTier: string;
  requestedDate: string;
  windowStart: string;
  windowEnd: string;
  comuna?: string;
  reason: LostRequestReason;
  alternativesOffered: unknown[];
  compositeOffered: boolean;
  compositeAccepted?: boolean;
}

export interface AgendaRuntimeConfig {
  specVersion: string;
  automationLevel: number;
  compliance: AgendaComplianceConfig;
  costConfig: MarginalCostConfig;
  travelConfig: TravelConfig;
  weights: AgendaEngineWeights;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  field: string,
  maximumLength = 160,
): string {
  const value = record[field];
  if (typeof value !== "string") throw new Error(`${field}_invalid`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maximumLength || trimmed.includes("/")) {
    throw new Error(`${field}_invalid`);
  }
  return trimmed;
}

function optionalStringField(
  record: Record<string, unknown>,
  field: string,
): string | undefined {
  if (record[field] === undefined || record[field] === null) return undefined;
  return stringField(record, field);
}

function integerField(
  record: Record<string, unknown>,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const value = record[field];
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${field}_invalid`);
  }
  return value;
}

function optionalNonNegativeInteger(
  record: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = record[field];
  if (value === undefined || value === null) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(`${field}_invalid`);
  }
  return value;
}

function validDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

export function minuteOfDay(value: string): number {
  const match = TIME_PATTERN.exec(value);
  if (!match) throw new Error("time_invalid");
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseLocation(value: unknown): TravelLocation {
  if (!isRecord(value)) throw new Error("destination_invalid");
  const comuna = typeof value.comuna === "string" && value.comuna.trim()
    ? value.comuna.trim()
    : undefined;
  const lat = typeof value.lat === "number" && Number.isFinite(value.lat)
    ? value.lat
    : undefined;
  const lng = typeof value.lng === "number" && Number.isFinite(value.lng)
    ? value.lng
    : undefined;
  if (!comuna && (lat === undefined || lng === undefined)) {
    throw new Error("destination_invalid");
  }
  return { comuna, lat, lng };
}

export function parseAgendaOptionsRequest(
  body: unknown,
  runtime: Pick<AgendaRuntimeConfig, "specVersion" | "automationLevel">,
): AgendaOptionsApiRequest {
  if (!isRecord(body)) throw new Error("body_invalid");
  const requestId = stringField(body, "requestId");
  if (!UUID_PATTERN.test(requestId)) throw new Error("requestId_invalid");
  const operationalDate = stringField(body, "date");
  if (!validDate(operationalDate)) {
    throw new Error("date_invalid");
  }
  const windowStart = stringField(body, "windowStart");
  const windowEnd = stringField(body, "windowEnd");
  const startMinute = minuteOfDay(windowStart);
  const endMinute = minuteOfDay(windowEnd);
  if (startMinute >= endMinute) throw new Error("window_invalid");
  if (typeof body.requiresAlturas !== "boolean") {
    throw new Error("requiresAlturas_invalid");
  }
  const compositeMemberMinutes = body.compositeMemberMinutes === undefined
    ? undefined
    : integerField(body, "compositeMemberMinutes", 1, 24 * 60);

  return {
    serviceId: stringField(body, "serviceId"),
    appointmentId: optionalStringField(body, "appointmentId"),
    buildingId: optionalStringField(body, "buildingId"),
    clientId: optionalStringField(body, "clientId"),
    tier: stringField(body, "tier", 40),
    request: {
      requestId,
      specVersion: runtime.specVersion,
      automationLevel: runtime.automationLevel,
      operationalDate,
      requiredMinutes: integerField(body, "requiredMinutes", 1, 24 * 60),
      compositeMemberMinutes,
      clientWindow: { startMinute, endMinute },
      serviceType: optionalStringField(body, "serviceType"),
      requiresAlturas: body.requiresAlturas,
      grossRevenueCOP: optionalNonNegativeInteger(body, "grossRevenueCOP"),
      otherMarginalCostCOP: optionalNonNegativeInteger(
        body,
        "otherMarginalCostCOP",
      ),
      destination: parseLocation(body.destination),
      departureHour: Math.floor(startMinute / 60),
    },
  };
}

export function parseAgendaLostRequest(body: unknown): AgendaLostApiRequest {
  if (!isRecord(body)) throw new Error("body_invalid");
  const requestId = stringField(body, "requestId");
  if (!UUID_PATTERN.test(requestId)) throw new Error("requestId_invalid");
  const requestedDate = stringField(body, "requestedDate");
  if (!validDate(requestedDate)) {
    throw new Error("requestedDate_invalid");
  }
  const windowStart = stringField(body, "windowStart");
  const windowEnd = stringField(body, "windowEnd");
  if (minuteOfDay(windowStart) >= minuteOfDay(windowEnd)) {
    throw new Error("window_invalid");
  }
  if (
    typeof body.reason !== "string" ||
    !LOST_REQUEST_REASONS.includes(body.reason as LostRequestReason)
  ) {
    throw new Error("reason_invalid");
  }
  if (
    body.alternativesOffered !== undefined &&
    !Array.isArray(body.alternativesOffered)
  ) {
    throw new Error("alternativesOffered_invalid");
  }
  if (typeof body.compositeOffered !== "boolean") {
    throw new Error("compositeOffered_invalid");
  }
  if (
    body.compositeAccepted !== undefined &&
    typeof body.compositeAccepted !== "boolean"
  ) {
    throw new Error("compositeAccepted_invalid");
  }

  return {
    serviceId: stringField(body, "serviceId"),
    requestId,
    requestedTier: stringField(body, "requestedTier", 40),
    requestedDate,
    windowStart,
    windowEnd,
    comuna: optionalStringField(body, "comuna"),
    reason: body.reason as LostRequestReason,
    alternativesOffered: Array.isArray(body.alternativesOffered)
      ? body.alternativesOffered
      : [],
    compositeOffered: body.compositeOffered,
    compositeAccepted: body.compositeAccepted as boolean | undefined,
  };
}
