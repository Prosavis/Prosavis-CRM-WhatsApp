/**
 * Cliente CRM → Edge Function app-automations-admin (Firestore vía Admin REST).
 */

import { supabase } from '@/config/supabase';
import type {
  AutomationRule,
  CreateAutomationPayload,
  UpdateAutomationPayload,
} from '@/types/automations';

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
  return error instanceof Error ? error.message : 'Error en reglas de app';
}

async function invokeAppAutomations<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(
    'app-automations-admin',
    { body },
  );

  if (error) {
    throw new Error(await parseInvokeError(error));
  }
  if (data === null || data === undefined) {
    throw new Error('Respuesta vacía de app-automations-admin');
  }
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const err = (data as { error?: string }).error;
    if (typeof err === 'string' && err.length > 0) {
      throw new Error(err);
    }
  }
  return data;
}

export async function listAppAutomations(): Promise<AutomationRule[]> {
  const result = await invokeAppAutomations<{ rules: AutomationRule[] }>({
    action: 'list',
  });
  return result.rules ?? [];
}

export async function createAppAutomation(
  payload: CreateAutomationPayload,
): Promise<AutomationRule> {
  const result = await invokeAppAutomations<{ rule: AutomationRule }>({
    action: 'create',
    name: payload.name,
    trigger: payload.trigger,
    delay: payload.delay,
    ruleAction: payload.action,
    actionConfig: payload.actionConfig,
  });
  return result.rule;
}

export async function updateAppAutomation(
  ruleId: string,
  payload: UpdateAutomationPayload,
): Promise<AutomationRule> {
  const result = await invokeAppAutomations<{ rule: AutomationRule }>({
    action: 'update',
    ruleId,
    name: payload.name,
    isActive: payload.isActive,
    trigger: payload.trigger,
    delay: payload.delay,
    ruleAction: payload.action,
    actionConfig: payload.actionConfig,
  });
  return result.rule;
}

export async function deleteAppAutomation(ruleId: string): Promise<void> {
  await invokeAppAutomations<{ success: boolean }>({
    action: 'delete',
    ruleId,
  });
}

export async function toggleAppAutomation(
  ruleId: string,
  isActive: boolean,
): Promise<AutomationRule> {
  const result = await invokeAppAutomations<{ rule: AutomationRule }>({
    action: 'toggle',
    ruleId,
    isActive,
  });
  return result.rule;
}
