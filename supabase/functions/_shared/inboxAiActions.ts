import type { NormalizedBookingContext } from './bookingContext.ts';
import { geminiGenerateJson } from './geminiClient.ts';
import type { InboxAiAppointment } from './inboxAiContextFormat.ts';

export type InboxAiProposedActionType =
  | 'create_appointment'
  | 'reschedule_appointment'
  | 'send_payment_link'
  | 'apply_tag'
  | 'send_template';

interface InboxAiProposedActionBase {
  id: string;
  type: InboxAiProposedActionType;
  label: string;
  reason: string;
  requiresConfirmation: true;
}

export type InboxAiProposedAction =
  | (InboxAiProposedActionBase & {
    type: 'create_appointment';
    payload: {
      scheduledDate: string;
      duration: 120 | 180 | 240 | 360 | 480;
      address: string;
      wantsKit: boolean;
    };
  })
  | (InboxAiProposedActionBase & {
    type: 'reschedule_appointment';
    payload: {
      appointmentId: string;
      scheduledDate: string;
    };
  })
  | (InboxAiProposedActionBase & {
    type: 'send_payment_link';
    payload: {
      url: string;
      amountCOP: number;
      reference?: string;
    };
  })
  | (InboxAiProposedActionBase & {
    type: 'apply_tag';
    payload: {
      tagName: string;
    };
  })
  | (InboxAiProposedActionBase & {
    type: 'send_template';
    payload: {
      templateName: string;
      languageCode: string;
      variables: Record<string, string>;
    };
  });

export interface InboxAiSuggestionOutput {
  suggestion: string;
  proposedActions: InboxAiProposedAction[];
}

export interface InboxAiActionGrounding {
  bookingContext: NormalizedBookingContext;
  appointments: Array<Pick<InboxAiAppointment, 'id'>>;
  wompiCheckoutUrl?: string;
  wompiAmountCOP?: number;
  wompiPaymentReference?: string;
}

const ACTION_COPY_SCHEMA = {
  label: { type: 'string' },
  reason: { type: 'string' },
};

export const INBOX_AI_SUGGESTION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestion', 'proposedActions'],
  properties: {
    suggestion: { type: 'string' },
    proposedActions: {
      type: 'array',
      maxItems: 5,
      items: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'label', 'reason', 'payload'],
            properties: {
              type: { type: 'string', enum: ['create_appointment'] },
              ...ACTION_COPY_SCHEMA,
              payload: {
                type: 'object',
                additionalProperties: false,
                required: [
                  'scheduledDate',
                  'duration',
                  'address',
                  'wantsKit',
                ],
                properties: {
                  scheduledDate: { type: 'string' },
                  duration: { type: 'integer', enum: [120, 180, 240, 360, 480] },
                  address: { type: 'string' },
                  wantsKit: { type: 'boolean' },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'label', 'reason', 'payload'],
            properties: {
              type: { type: 'string', enum: ['reschedule_appointment'] },
              ...ACTION_COPY_SCHEMA,
              payload: {
                type: 'object',
                additionalProperties: false,
                required: ['appointmentId', 'scheduledDate'],
                properties: {
                  appointmentId: { type: 'string' },
                  scheduledDate: { type: 'string' },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'label', 'reason', 'payload'],
            properties: {
              type: { type: 'string', enum: ['send_payment_link'] },
              ...ACTION_COPY_SCHEMA,
              payload: {
                type: 'object',
                additionalProperties: false,
                required: ['url', 'amountCOP'],
                properties: {
                  url: { type: 'string' },
                  amountCOP: { type: 'number' },
                  reference: { type: 'string' },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'label', 'reason', 'payload'],
            properties: {
              type: { type: 'string', enum: ['apply_tag'] },
              ...ACTION_COPY_SCHEMA,
              payload: {
                type: 'object',
                additionalProperties: false,
                required: ['tagName'],
                properties: {
                  tagName: { type: 'string' },
                },
              },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'label', 'reason', 'payload'],
            properties: {
              type: { type: 'string', enum: ['send_template'] },
              ...ACTION_COPY_SCHEMA,
              payload: {
                type: 'object',
                additionalProperties: false,
                required: ['templateName', 'languageCode', 'variables'],
                properties: {
                  templateName: { type: 'string' },
                  languageCode: { type: 'string' },
                  variables: {
                    type: 'object',
                    additionalProperties: { type: 'string' },
                  },
                },
              },
            },
          },
        ],
      },
    },
  },
};

const MAX_ACTIONS = 5;
const MAX_LABEL_CHARS = 120;
const MAX_REASON_CHARS = 500;
const OFFICIAL_DURATIONS = new Set([120, 180, 240, 360, 480]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function cleanActionText(value: unknown, maxChars: number): string {
  return cleanText(value).slice(0, maxChars);
}

function canonicalDedupeText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('es');
}

function canonicalizeDedupeValue(value: unknown): unknown {
  if (typeof value === 'string') return canonicalDedupeText(value);
  if (Array.isArray(value)) return value.map(canonicalizeDedupeValue);
  if (!isRecord(value)) return value;

  return Object.entries(value)
    .map(([key, entryValue]) => [
      canonicalDedupeText(key),
      canonicalizeDedupeValue(entryValue),
    ])
    .sort(([left], [right]) => String(left).localeCompare(String(right)));
}

function actionEquivalenceKey(action: InboxAiProposedAction): string {
  const payload = action.type === 'apply_tag' || action.type === 'send_template'
    ? canonicalizeDedupeValue(action.payload)
    : action.payload;
  return JSON.stringify({ type: action.type, payload });
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function buildApplyTagAction(
  source: Record<string, unknown>,
): InboxAiProposedAction | null {
  const payload = isRecord(source.payload) ? source.payload : null;
  const label = cleanActionText(source.label, MAX_LABEL_CHARS);
  const reason = cleanActionText(source.reason, MAX_REASON_CHARS);
  const tagName = cleanText(payload?.tagName);
  if (!payload || !label || !reason || !tagName) return null;

  return {
    id: crypto.randomUUID(),
    type: 'apply_tag',
    label,
    reason,
    requiresConfirmation: true,
    payload: { tagName },
  };
}

function buildPaymentAction(
  source: Record<string, unknown>,
  grounding: InboxAiActionGrounding,
): InboxAiProposedAction | null {
  const label = cleanActionText(source.label, MAX_LABEL_CHARS);
  const reason = cleanActionText(source.reason, MAX_REASON_CHARS);
  const url = cleanText(grounding.wompiCheckoutUrl);
  const amountCOP = grounding.wompiAmountCOP;
  if (
    !isRecord(source.payload) ||
    !label ||
    !reason ||
    !url ||
    !isHttpUrl(url) ||
    typeof amountCOP !== 'number' ||
    !Number.isFinite(amountCOP) ||
    amountCOP <= 0
  ) {
    return null;
  }
  const reference = cleanText(grounding.wompiPaymentReference);

  return {
    id: crypto.randomUUID(),
    type: 'send_payment_link',
    label,
    reason,
    requiresConfirmation: true,
    payload: {
      url,
      amountCOP,
      ...(reference ? { reference } : {}),
    },
  };
}

function officialDuration(
  value: unknown,
): 120 | 180 | 240 | 360 | 480 | null {
  return typeof value === 'number' &&
      Number.isInteger(value) &&
      OFFICIAL_DURATIONS.has(value)
    ? value as 120 | 180 | 240 | 360 | 480
    : null;
}

function buildCreateAppointmentAction(
  source: Record<string, unknown>,
  grounding: InboxAiActionGrounding,
): InboxAiProposedAction | null {
  const payload = isRecord(source.payload) ? source.payload : null;
  const label = cleanActionText(source.label, MAX_LABEL_CHARS);
  const reason = cleanActionText(source.reason, MAX_REASON_CHARS);
  const scheduledDate = cleanText(payload?.scheduledDate);
  const duration = officialDuration(
    grounding.bookingContext.collectedData.duration,
  );
  const address = cleanText(
    grounding.bookingContext.collectedData.address,
  );
  if (
    !payload ||
    !label ||
    !reason ||
    !scheduledDate ||
    !grounding.bookingContext.availableSlots.includes(scheduledDate) ||
    duration === null ||
    !address
  ) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    type: 'create_appointment',
    label,
    reason,
    requiresConfirmation: true,
    payload: {
      scheduledDate,
      duration,
      address,
      wantsKit: grounding.bookingContext.wantsKit,
    },
  };
}

function buildRescheduleAppointmentAction(
  source: Record<string, unknown>,
  grounding: InboxAiActionGrounding,
): InboxAiProposedAction | null {
  const payload = isRecord(source.payload) ? source.payload : null;
  const label = cleanActionText(source.label, MAX_LABEL_CHARS);
  const reason = cleanActionText(source.reason, MAX_REASON_CHARS);
  const appointmentId = cleanText(payload?.appointmentId);
  const scheduledDate = cleanText(payload?.scheduledDate);
  if (
    !payload ||
    !label ||
    !reason ||
    !appointmentId ||
    !scheduledDate ||
    !grounding.appointments.some(({ id }) => id === appointmentId) ||
    !grounding.bookingContext.availableSlots.includes(scheduledDate)
  ) {
    return null;
  }

  return {
    id: crypto.randomUUID(),
    type: 'reschedule_appointment',
    label,
    reason,
    requiresConfirmation: true,
    payload: { appointmentId, scheduledDate },
  };
}

function buildTemplateAction(
  source: Record<string, unknown>,
): InboxAiProposedAction | null {
  const payload = isRecord(source.payload) ? source.payload : null;
  const label = cleanActionText(source.label, MAX_LABEL_CHARS);
  const reason = cleanActionText(source.reason, MAX_REASON_CHARS);
  const templateName = cleanText(payload?.templateName);
  const languageCode = cleanText(payload?.languageCode);
  if (
    !payload ||
    !label ||
    !reason ||
    !templateName ||
    !languageCode ||
    !isRecord(payload.variables)
  ) {
    return null;
  }

  const variables: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(payload.variables).sort()) {
    const key = cleanText(rawKey);
    if (key && typeof rawValue === 'string') {
      variables[key] = cleanText(rawValue);
    }
  }

  return {
    id: crypto.randomUUID(),
    type: 'send_template',
    label,
    reason,
    requiresConfirmation: true,
    payload: { templateName, languageCode, variables },
  };
}

export function normalizeInboxAiSuggestionOutput(
  raw: unknown,
  grounding: InboxAiActionGrounding,
): InboxAiSuggestionOutput {
  const source = isRecord(raw) ? raw : {};
  const rawActions = Array.isArray(source.proposedActions)
    ? source.proposedActions
    : [];
  const proposedActions: InboxAiProposedAction[] = [];
  const seen = new Set<string>();

  for (const candidate of rawActions) {
    if (proposedActions.length >= MAX_ACTIONS) break;
    if (!isRecord(candidate)) continue;
    const action = candidate.type === 'apply_tag'
      ? buildApplyTagAction(candidate)
      : candidate.type === 'send_payment_link'
        ? buildPaymentAction(candidate, grounding)
        : candidate.type === 'create_appointment'
          ? buildCreateAppointmentAction(candidate, grounding)
          : candidate.type === 'reschedule_appointment'
            ? buildRescheduleAppointmentAction(candidate, grounding)
            : candidate.type === 'send_template'
              ? buildTemplateAction(candidate)
              : null;
    if (!action) continue;
    const equivalenceKey = actionEquivalenceKey(action);
    if (seen.has(equivalenceKey)) continue;
    seen.add(equivalenceKey);
    proposedActions.push(action);
  }

  return {
    suggestion: cleanText(source.suggestion),
    proposedActions,
  };
}

const ACTION_GENERATION_INSTRUCTIONS = [
  'Devuelve una sugerencia de respuesta y hasta 5 acciones propuestas.',
  'Las acciones son solo propuestas y no se han ejecutado.',
  'Propón únicamente acciones soportadas por el contexto grounded.',
  'Todas las acciones requieren confirmación humana antes de ejecutarse.',
  'No inventes slots, IDs de citas, links, montos, tags ni plantillas.',
  'Si no hay una acción segura y grounded, devuelve proposedActions vacío.',
].join('\n');

export async function generateInboxAiSuggestion(params: {
  apiKey: string;
  systemInstruction: string;
  contextPrompt: string;
  grounding: InboxAiActionGrounding;
}): Promise<InboxAiSuggestionOutput> {
  const raw = await geminiGenerateJson<unknown>({
    apiKey: params.apiKey,
    systemInstruction:
      `${params.systemInstruction}\n\n${ACTION_GENERATION_INSTRUCTIONS}`,
    prompt: params.contextPrompt,
    temperature: 0.4,
    responseJsonSchema: INBOX_AI_SUGGESTION_JSON_SCHEMA,
    logScope: 'suggest-whatsapp-agent-reply',
  });
  return normalizeInboxAiSuggestionOutput(raw, params.grounding);
}
