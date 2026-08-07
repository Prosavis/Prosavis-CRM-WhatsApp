import { describe, expect, it } from 'vitest';
import {
  formatHistoryMetaSummary,
  formatPropertySummaryLabel,
  formatSessionWindowLabel,
  hasInboxAiUsedContext,
} from './inboxAiUsedContext';

describe('inboxAiUsedContext helpers', () => {
  it('detects when there is context to show', () => {
    expect(hasInboxAiUsedContext(null)).toBe(false);
    expect(hasInboxAiUsedContext({})).toBe(false);
    expect(
      hasInboxAiUsedContext({
        historyMeta: { loaded: 3, truncated: false },
      }),
    ).toBe(true);
    expect(hasInboxAiUsedContext({ conversationTags: ['VIP'] })).toBe(true);
  });

  it('formats history meta with truncation flag', () => {
    expect(
      formatHistoryMetaSummary({ loaded: 20, truncated: true }),
    ).toBe('20 mensajes · ventana truncada');
    expect(
      formatHistoryMetaSummary({ loaded: 5, truncated: false }),
    ).toBe('5 mensajes');
  });

  it('formats property summary labels', () => {
    expect(
      formatPropertySummaryLabel({
        uniquePropertyCount: 1,
        pattern: 'single',
        patternLabel: 'Misma propiedad',
        properties: [{ address: 'Calle 1', appointmentCount: 1 }],
        appointmentsWithoutAddress: 0,
      }),
    ).toBe('Misma propiedad');
    expect(
      formatPropertySummaryLabel({
        uniquePropertyCount: 2,
        pattern: 'multiple',
        patternLabel: '',
        properties: [],
        appointmentsWithoutAddress: 0,
      }),
    ).toBe('2 propiedades distintas');
  });

  it('formats session window open/closed', () => {
    expect(
      formatSessionWindowLabel({
        status: 'closed',
        lastInboundAt: null,
        expiresAt: null,
        requiresTemplate: true,
      }),
    ).toBe('Cerrada · requiere plantilla');
    expect(
      formatSessionWindowLabel({
        status: 'open',
        lastInboundAt: '2026-08-05T10:00:00.000Z',
        expiresAt: '2026-08-06T10:00:00.000Z',
        requiresTemplate: false,
      }),
    ).toMatch(/^Abierta · expira /);
  });
});
