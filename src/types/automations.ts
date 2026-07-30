/**
 * Tipos para reglas de app (si X → Y): chat, push, tareas CRM.
 * SSOT de datos: Firestore services/{Prosavis Limpieza}/automations
 * (vía Edge Function app-automations-admin).
 */

export type AutomationTriggerType =
  | 'appointment_completed'
  | 'appointment_cancelled'
  | 'appointment_reminder_client'
  | 'appointment_reminder_professional'
  | 'client_first_appointment'
  | 'review_request';

export type AutomationActionType =
  | 'send_chat_message'
  | 'send_push_notification'
  | 'create_task';

export type DelayUnit = 'minutes' | 'hours';

export const REMINDER_HOURS_OPTIONS = [1, 2, 4, 12, 24, 48] as const;

export interface AutomationTrigger {
  type: AutomationTriggerType;
  hoursBeforeAppointment?: number;
}

export const TRIGGER_ACTION_COMPATIBILITY: Record<
  AutomationTriggerType,
  AutomationActionType[]
> = {
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

export interface AutomationDelay {
  value: number;
  unit: DelayUnit;
}

export interface SendChatMessageActionConfig {
  messageTemplate: string;
  recipient: 'client';
}

export interface SendPushNotificationActionConfig {
  title: string;
  bodyTemplate: string;
  recipient: 'client' | 'provider';
}

export interface CreateTaskActionConfig {
  taskTitle: string;
  taskType: 'call' | 'followup' | 'admin' | 'other';
  taskPriority: 'high' | 'medium' | 'low';
  assignToMember: 'none' | 'provider';
}

export type AutomationActionConfig =
  | SendChatMessageActionConfig
  | SendPushNotificationActionConfig
  | CreateTaskActionConfig;

export interface AutomationRule {
  id: string;
  serviceId: string;
  name: string;
  isActive: boolean;
  trigger: AutomationTrigger;
  delay: AutomationDelay;
  action: { type: AutomationActionType };
  actionConfig: AutomationActionConfig;
  createdBy: string;
  createdAt: string | null;
  updatedAt: string | null;
  executionCount: number;
}

export interface CreateAutomationPayload {
  name: string;
  trigger: AutomationTrigger;
  delay: AutomationDelay;
  action: { type: AutomationActionType };
  actionConfig: AutomationActionConfig;
}

export interface UpdateAutomationPayload {
  name?: string;
  isActive?: boolean;
  trigger?: AutomationTrigger;
  delay?: AutomationDelay;
  action?: { type: AutomationActionType };
  actionConfig?: AutomationActionConfig;
}
