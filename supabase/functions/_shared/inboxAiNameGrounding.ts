import { isUsableName } from './contactDisplayName.ts';
import type { InboxAiMemory } from './inboxAiMemory.ts';

const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const LETTER_TOKEN_RE = /[\p{L}][\p{L}'’.-]*/u;
const LEADING_PERSON_NAME_RE =
  /^([\p{Lu}\p{Lt}][\p{L}'’.-]*(?:\s+[\p{Lu}\p{Lt}][\p{L}'’.-]*){1,3})\b/u;
const GREETING_NAME_RE =
  /^((?:¡)?(?:Hola|Buenos días|Buenas tardes|Buenas noches|Excelente|Perfecto),?\s+)([\p{Lu}\p{Lt}][\p{L}'’.-]*)/iu;

export interface InboxAiNameSources {
  directoryName?: string | null;
  contactName?: string | null;
  whatsappProfileName?: string | null;
}

function asUsableName(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return isUsableName(trimmed) ? trimmed : null;
}

function normalizeNameToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(EMOJI_RE, '')
    .trim()
    .toLocaleLowerCase('es');
}

function stripNameDecorations(value: string): string {
  return value.replace(EMOJI_RE, '').replace(/\s+/g, ' ').trim();
}

function firstLetterToken(value: string | null | undefined): string | null {
  const cleaned = stripNameDecorations(value ?? '');
  const match = cleaned.match(LETTER_TOKEN_RE);
  return match?.[0] ?? null;
}

export function resolveInboxAiCanonicalName(
  sources: InboxAiNameSources,
): string | null {
  return asUsableName(sources.directoryName)
    ?? asUsableName(sources.contactName)
    ?? asUsableName(sources.whatsappProfileName);
}

export function resolveInboxAiGreetingFirstName(
  canonicalName: string | null | undefined,
): string | null {
  if (!isUsableName(canonicalName)) return null;
  return firstLetterToken(canonicalName);
}

function applyNameRewrite(
  text: string,
  canonicalName: string,
  foreignFullName?: string | null,
): string {
  const greetingFirst = resolveInboxAiGreetingFirstName(canonicalName);
  const canonicalPlain = stripNameDecorations(canonicalName);
  if (!greetingFirst || !canonicalPlain) return text;

  const leading = foreignFullName ?? text.match(LEADING_PERSON_NAME_RE)?.[1];
  if (!leading) return text;

  const leadingFirst = firstLetterToken(leading);
  if (!leadingFirst) return text;
  if (normalizeNameToken(leadingFirst) === normalizeNameToken(greetingFirst)) {
    return text;
  }

  const foreignFirst = new RegExp(`\\b${escapeRegExp(leadingFirst)}\\b`, 'giu');
  const foreignFull = new RegExp(`\\b${escapeRegExp(leading)}\\b`, 'giu');
  return text
    .replace(foreignFull, canonicalPlain)
    .replace(foreignFirst, greetingFirst);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function memoryUsesForeignClientName(
  memory: InboxAiMemory,
  canonicalName: string | null | undefined,
): boolean {
  if (!canonicalName || !isUsableName(canonicalName)) return false;
  return rewriteMemoryClientName(memory, canonicalName).summary !== memory.summary;
}

export function rewriteMemoryClientName(
  memory: InboxAiMemory,
  canonicalName: string,
): InboxAiMemory {
  if (!isUsableName(canonicalName)) return memory;
  const foreignFullName = memory.summary.match(LEADING_PERSON_NAME_RE)?.[1] ?? null;
  const rewrite = (value: string) => applyNameRewrite(value, canonicalName, foreignFullName);
  const summary = rewrite(memory.summary);
  const preferences = memory.preferences.map(rewrite);
  const objections = memory.objections.map(rewrite);
  const agreements = memory.agreements.map(rewrite);
  if (
    summary === memory.summary
    && preferences.every((value, index) => value === memory.preferences[index])
    && objections.every((value, index) => value === memory.objections[index])
    && agreements.every((value, index) => value === memory.agreements[index])
  ) {
    return memory;
  }
  return {
    ...memory,
    summary,
    preferences,
    objections,
    agreements,
  };
}

export function rewriteSuggestionGreetingName(
  suggestion: string,
  greetingFirstName: string | null | undefined,
): string {
  if (!greetingFirstName || !isUsableName(greetingFirstName)) return suggestion;
  const match = suggestion.match(GREETING_NAME_RE);
  if (!match?.[2]) return suggestion;
  if (normalizeNameToken(match[2]) === normalizeNameToken(greetingFirstName)) {
    return suggestion;
  }
  return `${match[1]}${greetingFirstName}${suggestion.slice(match[0].length)}`;
}
