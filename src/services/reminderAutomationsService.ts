import { supabase } from '@/config/supabase';
import type {
  ReminderAutomationsDashboard,
  ReminderHistoryResponse,
} from '@/types/reminderAutomations';

async function parseInvokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx) {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body.error) return body.error;
    } catch {
      /* ignore */
    }
  }
  return error instanceof Error ? error.message : 'Error al cargar automatizaciones';
}

export async function getReminderAutomationsDashboard(): Promise<ReminderAutomationsDashboard> {
  const { data, error } = await supabase.functions.invoke<ReminderAutomationsDashboard>(
    'reminder-automations-monitor',
    { body: { action: 'dashboard' } },
  );

  if (error) {
    throw new Error(await parseInvokeError(error));
  }
  if (!data) {
    throw new Error('Respuesta vacía del monitor de recordatorios');
  }
  if ('error' in data && typeof (data as { error?: string }).error === 'string') {
    throw new Error((data as { error: string }).error);
  }
  return data;
}

export interface RetryReminderResult {
  success: boolean;
  waMessageId?: string | null;
  error?: string;
}

export async function retryReminderSend(params: {
  appointmentId: string;
  recipientType: 'client' | 'professional';
  /** UID del co-asignado a reintentar (citas con más de un profesional). */
  memberId?: string | null;
}): Promise<RetryReminderResult> {
  const { data, error } = await supabase.functions.invoke<RetryReminderResult>(
    'reminder-automations-monitor',
    {
      body: {
        action: 'retry',
        appointmentId: params.appointmentId,
        recipientType: params.recipientType,
        memberId: params.memberId ?? undefined,
      },
    },
  );

  if (error) {
    throw new Error(await parseInvokeError(error));
  }
  if (!data) {
    throw new Error('Respuesta vacía al reintentar recordatorio');
  }
  if ('error' in data && typeof data.error === 'string' && !data.success) {
    throw new Error(data.error);
  }
  return data;
}

export async function setRecipientReminderPreference(params: {
  recipientKey: string;
  recipientType: 'client' | 'professional';
  remindersEnabled: boolean;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
    'reminder-automations-monitor',
    {
      body: {
        action: 'setRecipientPreference',
        recipientKey: params.recipientKey,
        recipientType: params.recipientType,
        remindersEnabled: params.remindersEnabled,
      },
    },
  );

  if (error) {
    throw new Error(await parseInvokeError(error));
  }
  if (data && 'error' in data && typeof data.error === 'string') {
    throw new Error(data.error);
  }
}

export async function getReminderHistory(params: {
  dateFrom: string;
  dateTo: string;
  recipientType?: 'client' | 'professional';
}): Promise<ReminderHistoryResponse> {
  const { data, error } = await supabase.functions.invoke<ReminderHistoryResponse>(
    'reminder-automations-monitor',
    {
      body: {
        action: 'history',
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        recipientType: params.recipientType,
      },
    },
  );

  if (error) {
    throw new Error(await parseInvokeError(error));
  }
  if (!data) {
    throw new Error('Respuesta vacía del historial de recordatorios');
  }
  if ('error' in data && typeof (data as { error?: string }).error === 'string') {
    throw new Error((data as { error: string }).error);
  }
  return data;
}
