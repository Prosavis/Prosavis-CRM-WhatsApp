import { supabase } from '@/config/supabase';
import type {
  PostServiceActionResult,
  PostServiceAutomationsDashboard,
  PostServiceHistoryResponse,
} from '@/types/postServiceAutomations';

const FUNCTION_NAME = 'post-service-automations-monitor';

async function parseInvokeError(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context;
  if (context) {
    try {
      const body = (await context.json()) as { error?: string };
      if (body.error) return body.error;
    } catch {
      // The invoke error message remains the best available fallback.
    }
  }
  return error instanceof Error ? error.message : 'Error al cargar automatizaciones post-servicio';
}

function getResponseError(data: unknown): string | null {
  if (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof data.error === 'string'
  ) {
    return data.error;
  }
  return null;
}

export async function getPostServiceAutomationsDashboard(): Promise<PostServiceAutomationsDashboard> {
  const { data, error } = await supabase.functions.invoke<PostServiceAutomationsDashboard>(
    FUNCTION_NAME,
    { body: { action: 'dashboard' } },
  );

  if (error) throw new Error(await parseInvokeError(error));
  if (!data) throw new Error('Respuesta vacía del monitor post-servicio');
  const responseError = getResponseError(data);
  if (responseError) throw new Error(responseError);
  return data;
}

export async function getPostServiceHistory(params: {
  dateFrom: string;
  dateTo: string;
}): Promise<PostServiceHistoryResponse> {
  const { data, error } = await supabase.functions.invoke<PostServiceHistoryResponse>(
    FUNCTION_NAME,
    {
      body: {
        action: 'history',
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
      },
    },
  );

  if (error) throw new Error(await parseInvokeError(error));
  if (!data) throw new Error('Respuesta vacía del historial post-servicio');
  const responseError = getResponseError(data);
  if (responseError) throw new Error(responseError);
  return data;
}

export async function retryPostServiceAutomation(params: {
  appointmentId: string;
}): Promise<PostServiceActionResult> {
  const { data, error } = await supabase.functions.invoke<PostServiceActionResult & { error?: string }>(
    FUNCTION_NAME,
    {
      body: {
        action: 'retry',
        appointmentId: params.appointmentId,
      },
    },
  );

  if (error) throw new Error(await parseInvokeError(error));
  if (!data) throw new Error('Respuesta vacía al reintentar el mensaje post-servicio');
  if (data.error && !data.success) throw new Error(data.error);
  return data;
}

export async function runPostServiceDryRun(params: {
  appointmentId?: string;
} = {}): Promise<PostServiceActionResult> {
  const { data, error } = await supabase.functions.invoke<PostServiceActionResult & { error?: string }>(
    FUNCTION_NAME,
    {
      body: {
        action: 'runDry',
        ...(params.appointmentId ? { appointmentId: params.appointmentId } : {}),
      },
    },
  );

  if (error) throw new Error(await parseInvokeError(error));
  if (!data) throw new Error('Respuesta vacía de la simulación post-servicio');
  if (data.error) throw new Error(data.error);
  return data;
}

export async function setPostServiceRecipientPreference(params: {
  directoryId: string;
  enabled: boolean;
}): Promise<void> {
  const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
    FUNCTION_NAME,
    {
      body: {
        action: 'setRecipientPreference',
        directoryId: params.directoryId,
        enabled: params.enabled,
      },
    },
  );

  if (error) throw new Error(await parseInvokeError(error));
  if (data?.error) throw new Error(data.error);
}
