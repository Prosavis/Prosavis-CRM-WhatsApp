import type { InboxAiProposedAction } from './inboxAiActions.ts';
import { FirebaseCrmBridgeHttpError } from './firebaseHttp.ts';
import { mergeTagIds } from './inboxAiActionHelpers.ts';

const OFFICIAL_DURATIONS = new Set([120, 180, 240, 360, 480]);

export class ExecuteInboxAiActionError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ExecuteInboxAiActionError';
    this.status = status;
    this.code = code;
  }
}

export interface InboxAiActionConversation {
  stableKey: string;
  phone: string;
  tagIds: string[];
  phoneNumberId?: string | null;
}

export interface InboxAiActionExecutionDeps {
  crmAdminId: string;
  loadConversation: (stableKey: string) => Promise<InboxAiActionConversation>;
  resolveTagByName: (tagName: string) => Promise<{ id: string; name: string } | null>;
  updateConversationTagIds: (stableKey: string, tagIds: string[]) => Promise<void>;
  resolveDirectoryId: (phone: string) => Promise<string | null>;
  resolveGroundedPaymentUrl: (params: {
    phone: string;
    amountCOP: number;
    url: string;
  }) => Promise<string | null>;
  findApprovedTemplate: (
    templateName: string,
    languageCode: string,
  ) => Promise<{ name: string; language: string } | null>;
  sendTemplate: (params: {
    recipientPhone: string;
    templateName: string;
    templateLanguage: string;
    phoneNumberId?: string;
    variables: Record<string, string>;
  }) => Promise<{ waMessageId?: string }>;
  postAppointmentAction: (body: Record<string, unknown>) => Promise<{
    appointmentId?: string;
    [key: string]: unknown;
  }>;
}

export type ExecuteInboxAiActionResult =
  | {
    type: 'apply_tag';
    tagId: string;
    tagName: string;
    tagIds: string[];
    alreadyPresent: boolean;
    suggestionFingerprint?: string;
  }
  | {
    type: 'send_payment_link';
    mode: 'insert_composer';
    text: string;
    suggestionFingerprint?: string;
  }
  | {
    type: 'send_template';
    success: true;
    waMessageId?: string;
    suggestionFingerprint?: string;
  }
  | {
    type: 'create_appointment' | 'reschedule_appointment';
    appointmentId: string;
    suggestionFingerprint?: string;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function assertRequiresConfirmation(action: InboxAiProposedAction): void {
  if (action.requiresConfirmation !== true) {
    throw new ExecuteInboxAiActionError(
      400,
      'La acción requiere confirmación humana (requiresConfirmation=true).',
      'confirmation_required',
    );
  }
}

function assertActionShape(action: InboxAiProposedAction): void {
  if (!asTrimmedString(action.id)) {
    throw new ExecuteInboxAiActionError(400, 'action.id es requerido.');
  }
  if (!asTrimmedString(action.label) || !asTrimmedString(action.reason)) {
    throw new ExecuteInboxAiActionError(400, 'action.label y action.reason son requeridos.');
  }
  if (!isRecord(action.payload)) {
    throw new ExecuteInboxAiActionError(400, 'action.payload es inválido.');
  }

  switch (action.type) {
    case 'apply_tag':
      if (!asTrimmedString(action.payload.tagName)) {
        throw new ExecuteInboxAiActionError(400, 'payload.tagName es requerido.');
      }
      break;
    case 'send_payment_link':
      if (!asTrimmedString(action.payload.url)) {
        throw new ExecuteInboxAiActionError(400, 'payload.url es requerido.');
      }
      if (
        typeof action.payload.amountCOP !== 'number' ||
        !Number.isFinite(action.payload.amountCOP)
      ) {
        throw new ExecuteInboxAiActionError(400, 'payload.amountCOP es inválido.');
      }
      break;
    case 'send_template':
      if (!asTrimmedString(action.payload.templateName)) {
        throw new ExecuteInboxAiActionError(400, 'payload.templateName es requerido.');
      }
      if (!asTrimmedString(action.payload.languageCode)) {
        throw new ExecuteInboxAiActionError(400, 'payload.languageCode es requerido.');
      }
      break;
    case 'create_appointment': {
      const duration = action.payload.duration;
      if (!asTrimmedString(action.payload.scheduledDate)) {
        throw new ExecuteInboxAiActionError(400, 'payload.scheduledDate es requerido.');
      }
      if (typeof duration !== 'number' || !OFFICIAL_DURATIONS.has(duration)) {
        throw new ExecuteInboxAiActionError(400, 'payload.duration no es oficial.');
      }
      if (typeof action.payload.wantsKit !== 'boolean') {
        throw new ExecuteInboxAiActionError(400, 'payload.wantsKit es requerido.');
      }
      break;
    }
    case 'reschedule_appointment':
      if (!asTrimmedString(action.payload.appointmentId)) {
        throw new ExecuteInboxAiActionError(400, 'payload.appointmentId es requerido.');
      }
      if (!asTrimmedString(action.payload.scheduledDate)) {
        throw new ExecuteInboxAiActionError(400, 'payload.scheduledDate es requerido.');
      }
      break;
    default: {
      const _exhaustive: never = action;
      throw new ExecuteInboxAiActionError(
        400,
        `Tipo de acción no soportado: ${String((_exhaustive as InboxAiProposedAction).type)}`,
      );
    }
  }
}

export function parseExecuteInboxAiActionRequest(body: unknown): {
  stableKey: string;
  action: InboxAiProposedAction;
  suggestionFingerprint?: string;
} {
  if (!isRecord(body)) {
    throw new ExecuteInboxAiActionError(400, 'Body JSON inválido.');
  }
  const stableKey = asTrimmedString(body.stableKey);
  if (!stableKey) {
    throw new ExecuteInboxAiActionError(400, 'Se requiere stableKey.');
  }
  if (!isRecord(body.action)) {
    throw new ExecuteInboxAiActionError(400, 'Se requiere action.');
  }

  const action = body.action as unknown as InboxAiProposedAction;
  assertRequiresConfirmation(action);
  assertActionShape(action);

  const suggestionFingerprint = asTrimmedString(body.suggestionFingerprint) || undefined;
  return { stableKey, action, suggestionFingerprint };
}

function mapAppointmentBridgeError(error: unknown): never {
  if (error instanceof FirebaseCrmBridgeHttpError) {
    if (error.status === 401) {
      throw new ExecuteInboxAiActionError(
        401,
        'No autorizado para mutar citas en Firebase.',
        'firebase_unauthorized',
      );
    }
    if (error.status === 409) {
      throw new ExecuteInboxAiActionError(
        409,
        'Conflicto al crear/reagendar la cita (posible operación duplicada).',
        'firebase_conflict',
      );
    }
    if (error.status === 422) {
      throw new ExecuteInboxAiActionError(
        422,
        'La cita fue rechazada por validación de Firebase.',
        'firebase_unprocessable',
      );
    }
    throw new ExecuteInboxAiActionError(
      error.status >= 400 && error.status < 600 ? error.status : 502,
      `Error del bridge de citas (${error.status}).`,
      'firebase_bridge_error',
    );
  }
  throw error;
}

function readAppointmentId(result: Record<string, unknown>): string {
  const direct = asTrimmedString(result.appointmentId);
  if (direct) return direct;
  if (isRecord(result.result)) {
    const nested = asTrimmedString(result.result.appointmentId);
    if (nested) return nested;
  }
  return '';
}

export async function executeInboxAiAction(params: {
  stableKey: string;
  action: InboxAiProposedAction;
  suggestionFingerprint?: string;
  deps: InboxAiActionExecutionDeps;
}): Promise<ExecuteInboxAiActionResult> {
  const { action, deps, suggestionFingerprint } = params;
  assertRequiresConfirmation(action);
  assertActionShape(action);

  const conversation = await deps.loadConversation(params.stableKey);
  const fingerprint = suggestionFingerprint
    ? { suggestionFingerprint }
    : {};

  switch (action.type) {
    case 'apply_tag': {
      const tag = await deps.resolveTagByName(action.payload.tagName);
      if (!tag) {
        throw new ExecuteInboxAiActionError(
          404,
          `Etiqueta no encontrada: ${action.payload.tagName}`,
          'tag_not_found',
        );
      }
      const merged = mergeTagIds(conversation.tagIds, tag.id);
      if (!merged.alreadyPresent) {
        await deps.updateConversationTagIds(conversation.stableKey, merged.nextIds);
      }
      return {
        type: 'apply_tag',
        tagId: tag.id,
        tagName: tag.name,
        tagIds: merged.nextIds,
        alreadyPresent: merged.alreadyPresent,
        ...fingerprint,
      };
    }
    case 'send_payment_link': {
      const requestedUrl = asTrimmedString(action.payload.url);
      const groundedUrl = await deps.resolveGroundedPaymentUrl({
        phone: conversation.phone,
        amountCOP: action.payload.amountCOP,
        url: requestedUrl,
      });
      if (!groundedUrl) {
        throw new ExecuteInboxAiActionError(
          422,
          'El link de pago no coincide con el checkout Wompi grounded actual.',
          'payment_link_mismatch',
        );
      }
      return {
        type: 'send_payment_link',
        mode: 'insert_composer',
        text: groundedUrl,
        ...fingerprint,
      };
    }
    case 'send_template': {
      const template = await deps.findApprovedTemplate(
        action.payload.templateName,
        action.payload.languageCode,
      );
      if (!template) {
        throw new ExecuteInboxAiActionError(
          404,
          'Plantilla Meta no encontrada o no aprobada.',
          'template_not_found',
        );
      }
      const sent = await deps.sendTemplate({
        recipientPhone: conversation.phone,
        templateName: template.name,
        templateLanguage: template.language,
        phoneNumberId: conversation.phoneNumberId ?? undefined,
        variables: action.payload.variables ?? {},
      });
      return {
        type: 'send_template',
        success: true,
        waMessageId: sent.waMessageId,
        ...fingerprint,
      };
    }
    case 'create_appointment':
    case 'reschedule_appointment': {
      const directoryId = await deps.resolveDirectoryId(conversation.phone);
      if (!directoryId) {
        throw new ExecuteInboxAiActionError(
          404,
          'No hay entrada crm_directory para este contacto.',
          'directory_not_found',
        );
      }

      const operationId = action.id.toLowerCase();
      const body: Record<string, unknown> = action.type === 'create_appointment'
        ? {
          operationId,
          crmAdminId: deps.crmAdminId,
          type: 'create_appointment',
          directoryId,
          scheduledDate: action.payload.scheduledDate,
          duration: action.payload.duration,
          wantsKit: action.payload.wantsKit,
        }
        : {
          operationId,
          crmAdminId: deps.crmAdminId,
          type: 'reschedule_appointment',
          directoryId,
          appointmentId: action.payload.appointmentId,
          scheduledDate: action.payload.scheduledDate,
        };

      let bridgeResult: Record<string, unknown>;
      try {
        bridgeResult = await deps.postAppointmentAction(body);
      } catch (error) {
        mapAppointmentBridgeError(error);
      }

      const appointmentId = readAppointmentId(bridgeResult);
      if (!appointmentId) {
        throw new ExecuteInboxAiActionError(
          502,
          'Firebase no devolvió appointmentId.',
          'missing_appointment_id',
        );
      }

      return {
        type: action.type,
        appointmentId,
        ...fingerprint,
      };
    }
    default: {
      const _exhaustive: never = action;
      throw new ExecuteInboxAiActionError(
        400,
        `Tipo de acción no soportado: ${String((_exhaustive as InboxAiProposedAction).type)}`,
      );
    }
  }
}
