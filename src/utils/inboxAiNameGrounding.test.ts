import { describe, expect, it } from 'vitest';
import type { InboxAiMemory } from '../../supabase/functions/_shared/inboxAiMemory';
import {
  resolveInboxAiCanonicalName,
  resolveInboxAiGreetingFirstName,
  rewriteMemoryClientName,
  rewriteSuggestionGreetingName,
} from '../../supabase/functions/_shared/inboxAiNameGrounding';

const memory = (summary: string, extras?: Partial<InboxAiMemory>): InboxAiMemory => ({
  stableKey: '573150004639',
  summary,
  preferences: extras?.preferences ?? [],
  objections: extras?.objections ?? [],
  agreements: extras?.agreements ?? [],
  lastSummarizedMessageAt: extras?.lastSummarizedMessageAt ?? null,
  messageCount: extras?.messageCount ?? 26,
  model: extras?.model ?? 'gemini-3.6-flash',
  updatedAt: extras?.updatedAt ?? '2026-08-20T19:16:39.364Z',
});

describe('resolveInboxAiCanonicalName', () => {
  it('prefers a usable directory name over WhatsApp names', () => {
    expect(resolveInboxAiCanonicalName({
      directoryName: 'Marii Duque✨',
      contactName: 'Otro',
      whatsappProfileName: 'WA',
    })).toBe('Marii Duque✨');
  });

  it('falls back to contact_name then WhatsApp profile', () => {
    expect(resolveInboxAiCanonicalName({
      directoryName: null,
      contactName: 'Marii Duque✨',
      whatsappProfileName: 'WA',
    })).toBe('Marii Duque✨');
    expect(resolveInboxAiCanonicalName({
      directoryName: '  ',
      contactName: null,
      whatsappProfileName: 'Marii Duque✨',
    })).toBe('Marii Duque✨');
  });

  it('rejects names without letters', () => {
    expect(resolveInboxAiCanonicalName({
      directoryName: '✨',
      contactName: '573150004639',
      whatsappProfileName: null,
    })).toBeNull();
  });
});

describe('resolveInboxAiGreetingFirstName', () => {
  it('takes the first letter token and strips emoji', () => {
    expect(resolveInboxAiGreetingFirstName('Marii Duque✨')).toBe('Marii');
    expect(resolveInboxAiGreetingFirstName('  Ana-María Pérez ')).toBe('Ana-María');
  });

  it('returns null when there is no usable name', () => {
    expect(resolveInboxAiGreetingFirstName(null)).toBeNull();
    expect(resolveInboxAiGreetingFirstName('✨')).toBeNull();
  });
});

describe('rewriteMemoryClientName', () => {
  it('replaces a leading person name that is not the canonical client', () => {
    const rewritten = rewriteMemoryClientName(
      memory(
        'Julieth Duque solicita un servicio de aseo de 4 horas.',
        { preferences: ['Pago en efectivo de Julieth'] },
      ),
      'Marii Duque✨',
    );
    expect(rewritten.summary).toBe('Marii Duque solicita un servicio de aseo de 4 horas.');
    expect(rewritten.preferences).toEqual(['Pago en efectivo de Marii']);
  });

  it('leaves memory unchanged when the leading name already matches', () => {
    const source = memory('Marii Duque solicita un servicio de aseo.');
    expect(rewriteMemoryClientName(source, 'Marii Duque✨')).toEqual(source);
  });

  it('does not treat a generic role summary as a person name', () => {
    const source = memory('Cliente recurrente que prefiere horario de tarde.');
    expect(rewriteMemoryClientName(source, 'Marii Duque✨')).toEqual(source);
  });
});

describe('rewriteSuggestionGreetingName', () => {
  it('rewrites a greeting that uses a different first name', () => {
    expect(rewriteSuggestionGreetingName(
      '¡Hola, Julieth! Muy bien, gracias por preguntar. 😊',
      'Marii',
    )).toBe('¡Hola, Marii! Muy bien, gracias por preguntar. 😊');
  });

  it('leaves greetings that already use the canonical first name', () => {
    expect(rewriteSuggestionGreetingName(
      '¡Hola, Marii! ¿En qué te ayudo?',
      'Marii',
    )).toBe('¡Hola, Marii! ¿En qué te ayudo?');
  });

  it('leaves text without a leading greeting name', () => {
    expect(rewriteSuggestionGreetingName(
      'Muy bien, gracias. Cuéntame, ¿en qué te puedo colaborar?',
      'Marii',
    )).toBe('Muy bien, gracias. Cuéntame, ¿en qué te puedo colaborar?');
  });
});
