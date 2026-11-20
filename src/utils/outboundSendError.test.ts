import { describe, expect, it } from 'vitest';
import { outboundSendErrorMessage, RECIPIENT_BLOCKED_MESSAGE } from './outboundSendError';

describe('outboundSendErrorMessage', () => {
  it('traduce el bloqueo por Decline', () => {
    expect(outboundSendErrorMessage(new Error('recipient_blocked'))).toBe(RECIPIENT_BLOCKED_MESSAGE);
  });

  it('conserva otro motivo y cubre un fallo sin mensaje', () => {
    expect(outboundSendErrorMessage(new Error('Meta no respondió'))).toBe('Meta no respondió');
    expect(outboundSendErrorMessage('x')).toBe('No se pudo enviar el mensaje');
  });
});
