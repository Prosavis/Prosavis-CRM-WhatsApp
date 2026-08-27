import { describe, expect, it } from 'vitest';
import {
  buildInboxAiContextPack,
  isInboxAiContextApiKeyValid,
  parseInboxAiContextPackRequest,
} from '../../supabase/functions/_shared/inboxAiContextPack';

const sessionWindow = {
  status: 'open' as const,
  lastInboundAt: '2026-08-25T15:00:00.000Z',
  expiresAt: '2026-08-26T15:00:00.000Z',
  requiresTemplate: false,
};

describe('parseInboxAiContextPackRequest', () => {
  it('requires stableKey or phone', () => {
    const parsed = parseInboxAiContextPackRequest({});
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.status).toBe(400);
    expect(parsed.error).toMatch(/stableKey|phone/);
  });

  it('defaults voice transcriptions on and official duration 240', () => {
    const parsed = parseInboxAiContextPackRequest({ phone: '573001112233' });
    expect(parsed).toEqual({
      ok: true,
      stableKey: '573001112233',
      includeVoiceTranscriptions: true,
      includeImageAnalysis: false,
      durationMinutes: 240,
    });
  });

  it('opts into image analysis only when requested', () => {
    const parsed = parseInboxAiContextPackRequest({
      phone: '573001112233',
      includeImageAnalysis: true,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.includeImageAnalysis).toBe(true);
  });

  it('accepts a numeric duration string and prefers stableKey', () => {
    const parsed = parseInboxAiContextPackRequest({
      stableKey: '57abc',
      phone: '573001112233',
      includeVoiceTranscriptions: false,
      durationMinutes: '360',
    });
    expect(parsed).toEqual({
      ok: true,
      stableKey: '57abc',
      includeVoiceTranscriptions: false,
      includeImageAnalysis: false,
      durationMinutes: 360,
    });
  });
});

describe('isInboxAiContextApiKeyValid', () => {
  it('rejects empty or mismatched keys', () => {
    expect(isInboxAiContextApiKeyValid('abc', 'abc')).toBe(true);
    expect(isInboxAiContextApiKeyValid('abc', 'abd')).toBe(false);
    expect(isInboxAiContextApiKeyValid('', 'abc')).toBe(false);
    expect(isInboxAiContextApiKeyValid('abc', '')).toBe(false);
    expect(isInboxAiContextApiKeyValid(null, 'abc')).toBe(false);
  });
});

describe('buildInboxAiContextPack', () => {
  it('returns the ✨ used-context slice plus slots and no suggestion', () => {
    const pack = buildInboxAiContextPack({
      formattedBlock: '=== Momento actual ===\nHoy',
      historyMeta: { loaded: 4, truncated: false },
      conversationTags: ['VIP'],
      propertySummary: {
        uniquePropertyCount: 1,
        pattern: 'single',
        patternLabel: 'Misma propiedad',
        properties: [{ address: 'Cra 1', appointmentCount: 2 }],
        appointmentsWithoutAddress: 0,
      },
      sessionWindow,
      greetingFirstName: 'Ana',
      appointmentsLoadFailed: false,
      lastTurnRole: 'user',
      availableSlots: ['2026-08-26T14:00:00.000Z'],
      wompiLinks: { 88000: 'https://checkout.wompi.co/l/6WXkiC' },
    });

    expect(pack).not.toHaveProperty('suggestion');
    expect(pack.usedContext).toEqual({
      historyMeta: { loaded: 4, truncated: false },
      conversationTags: ['VIP'],
      propertySummary: {
        uniquePropertyCount: 1,
        pattern: 'single',
        patternLabel: 'Misma propiedad',
        properties: [{ address: 'Cra 1', appointmentCount: 2 }],
        appointmentsWithoutAddress: 0,
      },
      sessionWindow,
      greetingFirstName: 'Ana',
    });
    expect(pack.availableSlots).toEqual(['2026-08-26T14:00:00.000Z']);
    expect(pack.wompiLinks[88000]).toContain('wompi.co');
    expect(pack.formattedBlock).toContain('=== Disponibilidad real (próximos días) ===');
    expect(pack.formattedBlock).toContain('2026-08-26T14:00:00.000Z');
    expect(pack.appointmentsLoadFailed).toBe(false);
    expect(pack.lastTurnRole).toBe('user');
  });
});
