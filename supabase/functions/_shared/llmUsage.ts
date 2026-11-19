import { llmCostUsd } from './llmCost.mjs';

export const LLM_PURPOSES = ['diagnosis', 'exam', 'reviewer', 'triage'] as const;
export type LlmPurpose = (typeof LLM_PURPOSES)[number];

export interface LlmUsageInsert {
  insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
}

export interface LlmUsageClient {
  from: (table: string) => LlmUsageInsert;
}

export interface LlmUsageRow {
  provider: string;
  model: string;
  purpose: LlmPurpose;
  runId?: string | null;
  inputTokens: number;
  outputTokens: number;
}

/** Escribe una fila del libro y devuelve el costo en USD. No imprime la clave ni el texto. */
export async function recordLlmUsage(supabase: LlmUsageClient, row: LlmUsageRow): Promise<number> {
  const costUsd = llmCostUsd(row.provider, row.inputTokens, row.outputTokens);
  const { error } = await supabase.from('sofia_llm_usage').insert({
    provider: row.provider,
    model: row.model,
    purpose: row.purpose,
    run_id: row.runId ?? null,
    input_tokens: Math.max(0, Math.round(row.inputTokens)),
    output_tokens: Math.max(0, Math.round(row.outputTokens)),
    cost_usd: costUsd,
  });
  if (error) throw new Error('No se pudo registrar el costo del modelo');
  return costUsd;
}
