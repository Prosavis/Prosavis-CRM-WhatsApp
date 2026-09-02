export const OUTBOUND_SENT_VIA = ['crm', 'grok', 'app', 'system'] as const;

export type OutboundSentVia = (typeof OUTBOUND_SENT_VIA)[number];

export function isOutboundSentVia(value: unknown): value is OutboundSentVia {
  return value === 'crm' || value === 'grok' || value === 'app' || value === 'system';
}
