export const SUGGEST_HISTORY_TURN_LIMIT = 40;
export const SUGGEST_TRANSCRIPT_CHAR_BUDGET = 12_000;
export const SUGGEST_PREFETCH_DURATIONS = [240, 360, 480] as const;

export type SuggestPipeline = 'legacy' | 'single';

function readEdgeEnv(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get?: (key: string) => string | undefined } };
  };
  return runtime.Deno?.env?.get?.(name)?.trim() || undefined;
}

export function readSuggestEnv(name: string): string | undefined {
  return readEdgeEnv(name);
}

/** Sin valor, o cualquier cosa distinta de `single`, se queda en las dos llamadas. */
export function resolveSuggestPipeline(): SuggestPipeline {
  return readEdgeEnv('INBOX_AI_SUGGEST_PIPELINE')?.toLowerCase() === 'single'
    ? 'single'
    : 'legacy';
}

export function suggestionStreamingEnabled(): boolean {
  return readEdgeEnv('INBOX_AI_SUGGEST_STREAM') === '1';
}

export function suggestionPrefetchEnabled(): boolean {
  return readEdgeEnv('INBOX_AI_SUGGEST_PREFETCH') === '1';
}

export function directoryNotesSummaryEnabled(): boolean {
  return readEdgeEnv('CRM_DIRECTORY_NOTES_SUMMARY') === '1';
}

/** Prompt v1 de Sofía. Apagado por defecto: solo con el valor exacto `1`. */
export function sofiaPromptV1Enabled(): boolean {
  return readEdgeEnv('SOFIA_PROMPT_V1') === '1';
}

export interface DraftGateInput {
  /** El prompt v1 está encendido para este chat. */
  sofiaPrompt: boolean;
  /** Las citas no se pudieron cargar. */
  appointmentsLoadFailed: boolean;
}

/**
 * Con el prompt v1, un contexto sin citas no produce borrador: el chat pasa a una persona.
 * Con el prompt vigente el borrador se redacta igual que hoy.
 */
export function suggestionDraftBlocked(input: DraftGateInput): boolean {
  return input.sofiaPrompt && input.appointmentsLoadFailed;
}
