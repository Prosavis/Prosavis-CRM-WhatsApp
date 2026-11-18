export const OUTBOUND_SENT_VIA = ['crm', 'grok', 'app', 'system'] as const;

export type OutboundSentVia = (typeof OUTBOUND_SENT_VIA)[number];

export function isOutboundSentVia(value: unknown): value is OutboundSentVia {
  return value === 'crm' || value === 'grok' || value === 'app' || value === 'system';
}

export type MessageAuthorKind =
  | 'persona'
  | 'sugerencia_ia'
  | 'automatica'
  | 'hub'
  | 'sofia'
  | 'bot_anterior';

export function authorKindForSentVia(sentVia: OutboundSentVia): MessageAuthorKind {
  switch (sentVia) {
    case 'crm':
    case 'app':
      return 'persona';
    case 'grok':
      return 'hub';
    case 'system':
      return 'automatica';
    default: {
      const unreachable: never = sentVia;
      return unreachable;
    }
  }
}
