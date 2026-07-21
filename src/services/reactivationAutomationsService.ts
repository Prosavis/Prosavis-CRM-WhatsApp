import { supabase } from '@/config/supabase';
import type {
  ReactivationDashboard,
  ReactivationHistoryResponse,
} from '@/types/reactivationAutomations';

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
  return error instanceof Error ? error.message : 'Error al cargar reactivaciones';
}

export async function getReactivationAutomationsDashboard(): Promise<ReactivationDashboard> {
  const { data, error } = await supabase.functions.invoke<ReactivationDashboard>(
    'reactivation-automations-monitor',
    { body: { action: 'dashboard' } },
  );

  if (error) throw new Error(await parseInvokeError(error));
  if (!data) throw new Error('Respuesta vacía del monitor de reactivaciones');
  if ('error' in data && typeof (data as { error?: string }).error === 'string') {
    throw new Error((data as { error: string }).error);
  }
  return data;
}

export async function getReactivationHistory(params: {
  dateFrom: string;
  dateTo: string;
}): Promise<ReactivationHistoryResponse> {
  const { data, error } = await supabase.functions.invoke<ReactivationHistoryResponse>(
    'reactivation-automations-monitor',
    {
      body: {
        action: 'history',
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      },
    },
  );

  if (error) throw new Error(await parseInvokeError(error));
  if (!data) throw new Error('Respuesta vacía del historial de reactivaciones');
  if ('error' in data && typeof (data as { error?: string }).error === 'string') {
    throw new Error((data as { error: string }).error);
  }
  return data;
}

export async function setRecipientReactivationPreference(params: {
  directoryId: string;
  reactivationsEnabled: boolean;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
    'reactivation-automations-monitor',
    {
      body: {
        action: 'setRecipientPreference',
        directoryId: params.directoryId,
        reactivationsEnabled: params.reactivationsEnabled,
      },
    },
  );

  if (error) throw new Error(await parseInvokeError(error));
  if (data && 'error' in data && typeof data.error === 'string') {
    throw new Error(data.error);
  }
}

export async function suspendReactivationRecipient(params: {
  directoryId: string;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
    'reactivation-automations-monitor',
    {
      body: {
        action: 'suspendRecipient',
        directoryId: params.directoryId,
      },
    },
  );

  if (error) throw new Error(await parseInvokeError(error));
  if (data && 'error' in data && typeof data.error === 'string') {
    throw new Error(data.error);
  }
}

export async function retryReactivationStep(params: {
  directoryId: string;
  stepNumber: number;
}): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke<{
    success?: boolean;
    waMessageId?: string;
    error?: string;
  }>('reactivation-automations-monitor', {
    body: {
      action: 'retryStep',
      directoryId: params.directoryId,
      stepNumber: params.stepNumber,
    },
  });

  if (error) throw new Error(await parseInvokeError(error));
  if (!data) throw new Error('Respuesta vacía al reintentar reactivación');
  if ('error' in data && typeof data.error === 'string' && !data.success) {
    throw new Error(data.error);
  }
  return {
    success: Boolean(data.success),
    waMessageId: data.waMessageId,
    error: data.error,
  };
}

export async function runReactivationDryRun(limit = 20): Promise<{
  success: boolean;
  stats?: Record<string, number>;
  dueCount?: number;
  events?: unknown[];
  runId?: string | null;
}> {
  const { data, error } = await supabase.functions.invoke<{
    success?: boolean;
    stats?: Record<string, number>;
    dueCount?: number;
    events?: unknown[];
    runId?: string | null;
    error?: string;
  }>('reactivation-automations-monitor', {
    body: { action: 'runDry', limit },
  });

  if (error) throw new Error(await parseInvokeError(error));
  if (!data) throw new Error('Respuesta vacía del dry-run');
  if (data.error) throw new Error(data.error);
  return {
    success: Boolean(data.success),
    stats: data.stats,
    dueCount: data.dueCount,
    events: data.events,
    runId: data.runId,
  };
}

export async function runReactivationReal(limit?: number): Promise<{
  success: boolean;
  stats?: Record<string, number>;
  dueCount?: number;
  events?: unknown[];
  runId?: string | null;
}> {
  const { data, error } = await supabase.functions.invoke<{
    success?: boolean;
    stats?: Record<string, number>;
    dueCount?: number;
    events?: unknown[];
    runId?: string | null;
    error?: string;
  }>('reactivation-automations-monitor', {
    body: {
      action: 'runReal',
      ...(limit != null ? { limit } : {}),
    },
  });

  if (error) throw new Error(await parseInvokeError(error));
  if (!data) throw new Error('Respuesta vacía del envío real');
  if (data.error) throw new Error(data.error);
  return {
    success: Boolean(data.success),
    stats: data.stats,
    dueCount: data.dueCount,
    events: data.events,
    runId: data.runId,
  };
}
