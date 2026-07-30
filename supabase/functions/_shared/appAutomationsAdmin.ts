/**
 * CRUD admin de reglas app (si X → Y) en
 * services/{PROSAVIS_CLEANING_SERVICE_ID}/automations.
 * Ejecución sigue en Cloud Functions; aquí solo gestión desde CRM.
 */

import {
  createFirestoreSubcollectionDocument,
  deleteFirestoreSubcollectionDocument,
  getFirestoreSubcollectionDocument,
  patchFirestoreSubcollectionDocument,
  runFirestoreSubcollectionQuery,
} from './firebaseAdminRest.ts';

export const PROSAVIS_CLEANING_SERVICE_ID = 'nwEMgpEqVwY3o95u3PNE';
const COLLECTION = 'automations';
const PARENT = `services/${PROSAVIS_CLEANING_SERVICE_ID}`;

const TRIGGER_TYPES = new Set([
  'appointment_completed',
  'appointment_cancelled',
  'appointment_reminder_client',
  'appointment_reminder_professional',
  'client_first_appointment',
  'review_request',
]);

const ACTION_TYPES = new Set([
  'send_chat_message',
  'send_push_notification',
  'create_task',
]);

const REMINDER_HOURS = new Set([1, 2, 4, 12, 24, 48]);

const COMPATIBILITY: Record<string, string[]> = {
  appointment_completed: [
    'send_chat_message',
    'send_push_notification',
    'create_task',
  ],
  appointment_cancelled: [
    'send_chat_message',
    'send_push_notification',
    'create_task',
  ],
  appointment_reminder_client: ['send_push_notification'],
  appointment_reminder_professional: ['send_push_notification'],
  client_first_appointment: ['send_chat_message'],
  review_request: ['send_push_notification'],
};

export class AppAutomationsError extends Error {
  constructor(
    public readonly code:
      | 'invalid-argument'
      | 'not-found'
      | 'failed-precondition'
      | 'internal',
    message: string,
  ) {
    super(message);
    this.name = 'AppAutomationsError';
  }
}

export function appAutomationsErrorStatus(err: AppAutomationsError): number {
  switch (err.code) {
    case 'invalid-argument':
      return 400;
    case 'not-found':
      return 404;
    case 'failed-precondition':
      return 412;
    default:
      return 500;
  }
}

export interface AppAutomationRule {
  id: string;
  serviceId: string;
  name: string;
  isActive: boolean;
  trigger: { type: string; hoursBeforeAppointment?: number };
  delay: { value: number; unit: 'minutes' | 'hours' };
  action: { type: string };
  actionConfig: Record<string, unknown>;
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
  executionCount: number;
}

export interface CreateAppAutomationPayload {
  name: string;
  trigger: { type: string; hoursBeforeAppointment?: number };
  delay: { value: number; unit: 'minutes' | 'hours' };
  action: { type: string };
  actionConfig: Record<string, unknown>;
}

export interface UpdateAppAutomationPayload {
  name?: string;
  isActive?: boolean;
  trigger?: { type: string; hoursBeforeAppointment?: number };
  delay?: { value: number; unit: 'minutes' | 'hours' };
  action?: { type: string };
  actionConfig?: Record<string, unknown>;
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function mapDoc(id: string, data: Record<string, unknown>): AppAutomationRule {
  const trigger = (data.trigger as AppAutomationRule['trigger']) ?? {
    type: 'appointment_completed',
  };
  const delay = (data.delay as AppAutomationRule['delay']) ?? {
    value: 0,
    unit: 'minutes',
  };
  const action = (data.action as AppAutomationRule['action']) ?? {
    type: 'send_chat_message',
  };
  return {
    id,
    serviceId: String(data.serviceId ?? PROSAVIS_CLEANING_SERVICE_ID),
    name: String(data.name ?? ''),
    isActive: data.isActive !== false,
    trigger,
    delay,
    action,
    actionConfig: (data.actionConfig as Record<string, unknown>) ?? {},
    createdBy: String(data.createdBy ?? ''),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    executionCount: Number(data.executionCount ?? 0),
  };
}

function validatePayload(payload: CreateAppAutomationPayload): void {
  const name = String(payload.name ?? '').trim();
  if (!name) {
    throw new AppAutomationsError('invalid-argument', 'El nombre es obligatorio.');
  }

  const triggerType = String(payload.trigger?.type ?? '');
  if (!TRIGGER_TYPES.has(triggerType)) {
    throw new AppAutomationsError('invalid-argument', `Trigger inválido: ${triggerType}`);
  }

  const actionType = String(payload.action?.type ?? '');
  if (!ACTION_TYPES.has(actionType)) {
    throw new AppAutomationsError('invalid-argument', `Acción inválida: ${actionType}`);
  }

  const compatible = COMPATIBILITY[triggerType] ?? [];
  if (!compatible.includes(actionType)) {
    throw new AppAutomationsError(
      'invalid-argument',
      `La acción ${actionType} no es compatible con ${triggerType}.`,
    );
  }

  const isReminder =
    triggerType === 'appointment_reminder_client' ||
    triggerType === 'appointment_reminder_professional';
  if (isReminder) {
    const hours = Number(payload.trigger.hoursBeforeAppointment ?? 0);
    if (!REMINDER_HOURS.has(hours)) {
      throw new AppAutomationsError(
        'invalid-argument',
        'hoursBeforeAppointment debe ser 1, 2, 4, 12, 24 o 48.',
      );
    }
  }

  const delayValue = Number(payload.delay?.value ?? 0);
  const delayUnit = payload.delay?.unit ?? 'minutes';
  if (!Number.isFinite(delayValue) || delayValue < 0) {
    throw new AppAutomationsError('invalid-argument', 'delay.value inválido.');
  }
  if (delayUnit !== 'minutes' && delayUnit !== 'hours') {
    throw new AppAutomationsError('invalid-argument', 'delay.unit inválido.');
  }
  if (delayUnit === 'hours' && delayValue > 72) {
    throw new AppAutomationsError(
      'invalid-argument',
      'El delay máximo es 72 horas.',
    );
  }

  const config = payload.actionConfig ?? {};
  if (actionType === 'send_chat_message') {
    if (!String(config.messageTemplate ?? '').trim()) {
      throw new AppAutomationsError(
        'invalid-argument',
        'messageTemplate es obligatorio.',
      );
    }
  } else if (actionType === 'send_push_notification') {
    if (!String(config.title ?? '').trim() || !String(config.bodyTemplate ?? '').trim()) {
      throw new AppAutomationsError(
        'invalid-argument',
        'title y bodyTemplate son obligatorios.',
      );
    }
  } else if (actionType === 'create_task') {
    if (!String(config.taskTitle ?? '').trim()) {
      throw new AppAutomationsError('invalid-argument', 'taskTitle es obligatorio.');
    }
  }
}

export async function listAppAutomations(): Promise<AppAutomationRule[]> {
  const docs = await runFirestoreSubcollectionQuery(PARENT, COLLECTION, {
    orderBy: [
      {
        field: { fieldPath: 'createdAt' },
        direction: 'DESCENDING',
      },
    ],
  });
  return docs.map((d) => mapDoc(d.id, d.data));
}

export async function createAppAutomation(
  createdBy: string,
  payload: CreateAppAutomationPayload,
): Promise<AppAutomationRule> {
  validatePayload(payload);

  const now = new Date();
  const trigger: Record<string, unknown> = { type: payload.trigger.type };
  if (
    payload.trigger.type === 'appointment_reminder_client' ||
    payload.trigger.type === 'appointment_reminder_professional'
  ) {
    trigger.hoursBeforeAppointment = Number(payload.trigger.hoursBeforeAppointment);
  }

  const created = await createFirestoreSubcollectionDocument(PARENT, COLLECTION, {
    serviceId: PROSAVIS_CLEANING_SERVICE_ID,
    name: payload.name.trim(),
    isActive: true,
    trigger,
    delay: {
      value: Math.max(0, Number(payload.delay.value) || 0),
      unit: payload.delay.unit,
    },
    action: { type: payload.action.type },
    actionConfig: payload.actionConfig,
    createdBy,
    createdAt: now,
    updatedAt: now,
    executionCount: 0,
  });

  return mapDoc(created.id, created.data);
}

export async function updateAppAutomation(
  ruleId: string,
  payload: UpdateAppAutomationPayload,
): Promise<AppAutomationRule> {
  const id = String(ruleId ?? '').trim();
  if (!id) {
    throw new AppAutomationsError('invalid-argument', 'ruleId es obligatorio.');
  }

  const existing = await getFirestoreSubcollectionDocument(PARENT, COLLECTION, id);
  if (!existing) {
    throw new AppAutomationsError('not-found', 'Regla no encontrada.');
  }

  const merged: CreateAppAutomationPayload = {
    name: payload.name ?? String(existing.name ?? ''),
    trigger: (payload.trigger ??
      existing.trigger) as CreateAppAutomationPayload['trigger'],
    delay: (payload.delay ?? existing.delay) as CreateAppAutomationPayload['delay'],
    action: (payload.action ??
      existing.action) as CreateAppAutomationPayload['action'],
    actionConfig: (payload.actionConfig ??
      existing.actionConfig) as Record<string, unknown>,
  };
  validatePayload(merged);

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (payload.name !== undefined) patch.name = payload.name.trim();
  if (payload.isActive !== undefined) patch.isActive = payload.isActive === true;
  if (payload.trigger !== undefined) {
    const trigger: Record<string, unknown> = { type: payload.trigger.type };
    if (
      payload.trigger.type === 'appointment_reminder_client' ||
      payload.trigger.type === 'appointment_reminder_professional'
    ) {
      trigger.hoursBeforeAppointment = Number(
        payload.trigger.hoursBeforeAppointment,
      );
    }
    patch.trigger = trigger;
  }
  if (payload.delay !== undefined) {
    patch.delay = {
      value: Math.max(0, Number(payload.delay.value) || 0),
      unit: payload.delay.unit,
    };
  }
  if (payload.action !== undefined) patch.action = { type: payload.action.type };
  if (payload.actionConfig !== undefined) patch.actionConfig = payload.actionConfig;

  await patchFirestoreSubcollectionDocument(PARENT, COLLECTION, id, patch);
  const updated = await getFirestoreSubcollectionDocument(PARENT, COLLECTION, id);
  if (!updated) {
    throw new AppAutomationsError('internal', 'No se pudo releer la regla.');
  }
  return mapDoc(id, updated);
}

export async function deleteAppAutomation(ruleId: string): Promise<{ success: true }> {
  const id = String(ruleId ?? '').trim();
  if (!id) {
    throw new AppAutomationsError('invalid-argument', 'ruleId es obligatorio.');
  }
  const existing = await getFirestoreSubcollectionDocument(PARENT, COLLECTION, id);
  if (!existing) {
    throw new AppAutomationsError('not-found', 'Regla no encontrada.');
  }
  await deleteFirestoreSubcollectionDocument(PARENT, COLLECTION, id);
  return { success: true };
}

export async function toggleAppAutomation(
  ruleId: string,
  isActive: boolean,
): Promise<AppAutomationRule> {
  return updateAppAutomation(ruleId, { isActive: isActive === true });
}
