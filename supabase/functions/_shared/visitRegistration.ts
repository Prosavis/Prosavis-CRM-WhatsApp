export interface VisitReferralInput {
  name: string;
  phone: string | null;
  email: string | null;
  relationship: string | null;
}

export interface VisitOpportunityInput {
  type: "rebooking" | "upsell" | "recovery";
  title: string;
  estimatedValueCop: number;
  nextActionOn: string | null;
  notes: string | null;
}

export interface VisitRegistrationInput {
  serviceId: string;
  clientReference: string;
  directoryId: string | null;
  routeId: string | null;
  routeSequence: number | null;
  satisfaction: number;
  notes: string | null;
  idempotencyKey: string;
  referral: VisitReferralInput | null;
  opportunity: VisitOpportunityInput | null;
}

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredId(
  value: unknown,
  label: string,
  minimumLength = 1,
): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (
    normalized.length < minimumLength ||
    normalized.length > 200 ||
    !ID_PATTERN.test(normalized)
  ) {
    throw new Error(`${label} inválido.`);
  }
  return normalized;
}

function optionalUuid(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new Error(`${label} inválido.`);
  }
  return value.trim();
}

function optionalText(
  value: unknown,
  label: string,
  maximumLength: number,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${label} inválido.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) {
    throw new Error(`${label} inválido.`);
  }
  return normalized;
}

function parseReferral(value: unknown): VisitReferralInput | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new Error("Referido inválido.");
  const name = optionalText(value.name, "Nombre del referido", 200);
  const phone = optionalText(value.phone, "Teléfono del referido", 40);
  const email = optionalText(value.email, "Correo del referido", 320);
  if (!name || (!phone && !email)) {
    throw new Error("El referido exige nombre y al menos un contacto.");
  }
  return {
    name,
    phone,
    email,
    relationship: optionalText(value.relationship, "Relación", 100),
  };
}

function parseOpportunity(value: unknown): VisitOpportunityInput | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new Error("Oportunidad inválida.");
  const type = value.type;
  if (!["rebooking", "upsell", "recovery"].includes(String(type))) {
    throw new Error("Tipo de oportunidad inválido.");
  }
  const title = optionalText(value.title, "Título de oportunidad", 200);
  if (!title || title.length < 3) {
    throw new Error("Título de oportunidad inválido.");
  }
  const estimatedValueCop = value.estimatedValueCop ?? 0;
  if (
    typeof estimatedValueCop !== "number" ||
    !Number.isFinite(estimatedValueCop) ||
    estimatedValueCop < 0
  ) {
    throw new Error("Valor de oportunidad inválido.");
  }
  const nextActionOn = optionalText(
    value.nextActionOn,
    "Fecha de seguimiento",
    10,
  );
  if (nextActionOn && !DATE_PATTERN.test(nextActionOn)) {
    throw new Error("Fecha de seguimiento inválida.");
  }
  return {
    type: type as VisitOpportunityInput["type"],
    title,
    estimatedValueCop: Math.round(estimatedValueCop),
    nextActionOn,
    notes: optionalText(value.notes, "Notas de oportunidad", 2_000),
  };
}

export function parseVisitRegistration(
  value: unknown,
): VisitRegistrationInput {
  if (!isRecord(value)) throw new Error("Body inválido.");
  const satisfaction = value.satisfaction;
  if (
    typeof satisfaction !== "number" ||
    !Number.isInteger(satisfaction) ||
    satisfaction < 1 ||
    satisfaction > 5
  ) {
    throw new Error("La satisfacción debe estar entre 1 y 5.");
  }
  const routeSequence = value.routeSequence;
  if (
    routeSequence !== undefined &&
    routeSequence !== null &&
    (
      typeof routeSequence !== "number" ||
      !Number.isInteger(routeSequence) ||
      routeSequence < 1
    )
  ) {
    throw new Error("Secuencia de ruta inválida.");
  }

  return {
    serviceId: requiredId(value.serviceId, "Servicio"),
    clientReference: requiredId(value.clientReference, "Cliente"),
    directoryId: optionalUuid(value.directoryId, "Directorio"),
    routeId: optionalUuid(value.routeId, "Ruta"),
    routeSequence: routeSequence === undefined || routeSequence === null
      ? null
      : routeSequence,
    satisfaction,
    notes: optionalText(value.notes, "Notas", 4_000),
    idempotencyKey: requiredId(
      value.idempotencyKey,
      "Idempotency key",
      8,
    ),
    referral: parseReferral(value.referral),
    opportunity: parseOpportunity(value.opportunity),
  };
}
