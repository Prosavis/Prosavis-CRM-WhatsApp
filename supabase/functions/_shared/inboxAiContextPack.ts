/**
 * Pack-only del contexto IA del inbox (sin Gemini de reply).
 * Lo usan el ✨ (mismos ojos) y get-inbox-ai-context / Grok Inbox.
 */

import {
  appendRealAvailabilityContext,
  resolveOfficialDuration,
} from './availability.ts';
import type { ConversationHistoryMeta } from './conversationHistory.ts';
import type { InboxAiPropertySummary } from './inboxAiContextFormat.ts';
import type { MetaSessionWindow } from './metaSessionWindow.ts';

export interface InboxAiContextPackUsedContext {
  historyMeta: ConversationHistoryMeta;
  conversationTags: string[];
  propertySummary: InboxAiPropertySummary | null;
  sessionWindow: MetaSessionWindow;
  greetingFirstName: string | null;
}

export interface InboxAiContextPack {
  formattedBlock: string;
  usedContext: InboxAiContextPackUsedContext;
  availableSlots: string[];
  wompiLinks: Record<number, string>;
  appointmentsLoadFailed: boolean;
  lastTurnRole: 'user' | 'bot' | null;
}

export type InboxAiContextPackRequest =
  | {
    ok: true;
    stableKey: string;
    includeVoiceTranscriptions: boolean;
    includeImageAnalysis: boolean;
    durationMinutes: number;
  }
  | {
    ok: false;
    error: string;
    status: 400;
  };

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asDurationMinutes(value: unknown): unknown {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

export function parseInboxAiContextPackRequest(
  body: unknown,
): InboxAiContextPackRequest {
  const record = body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const stableKey = asTrimmedString(record.stableKey) || asTrimmedString(record.phone);
  if (!stableKey) {
    return {
      ok: false,
      error: 'Se requiere stableKey o phone.',
      status: 400,
    };
  }
  return {
    ok: true,
    stableKey,
    includeVoiceTranscriptions: record.includeVoiceTranscriptions !== false,
    includeImageAnalysis: record.includeImageAnalysis === true,
    durationMinutes: resolveOfficialDuration(asDurationMinutes(record.durationMinutes)),
  };
}

export function isInboxAiContextApiKeyValid(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const got = provided?.trim() ?? '';
  const want = expected?.trim() ?? '';
  if (!got || !want || got.length !== want.length) return false;
  let mismatch = 0;
  for (let i = 0; i < got.length; i += 1) {
    mismatch |= got.charCodeAt(i) ^ want.charCodeAt(i);
  }
  return mismatch === 0;
}

export function buildInboxAiContextPack(input: {
  formattedBlock: string;
  historyMeta: ConversationHistoryMeta;
  conversationTags: string[];
  propertySummary: InboxAiPropertySummary | null;
  sessionWindow: MetaSessionWindow;
  greetingFirstName: string | null;
  appointmentsLoadFailed: boolean;
  lastTurnRole: 'user' | 'bot' | null;
  availableSlots: string[];
  wompiLinks: Record<number, string>;
}): InboxAiContextPack {
  return {
    formattedBlock: appendRealAvailabilityContext(
      input.formattedBlock,
      input.availableSlots,
    ),
    usedContext: {
      historyMeta: input.historyMeta,
      conversationTags: [...input.conversationTags],
      propertySummary: input.propertySummary,
      sessionWindow: input.sessionWindow,
      greetingFirstName: input.greetingFirstName,
    },
    availableSlots: [...input.availableSlots],
    wompiLinks: { ...input.wompiLinks },
    appointmentsLoadFailed: input.appointmentsLoadFailed === true,
    lastTurnRole: input.lastTurnRole,
  };
}
