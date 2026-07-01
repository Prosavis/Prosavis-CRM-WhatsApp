import { supabase } from '@/config/supabase';
import type { ReminderAutomationsDashboard } from '@/types/reminderAutomations';

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
