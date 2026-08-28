import { describe, expect, it } from 'vitest';
import type { WhatsAppMessage } from '@/services/whatsappService';
import {
  applyInboxMessageEvent,
  hasMoreMessages,
  markOptimisticFailed,
  mergeInboxMessages,
  prependOlderMessages,
  reconcileOptimisticMessage,
} from './inboxMessageCache';

function msg(partial: Partial<WhatsAppMessage> & { id: string }): WhatsAppMessage {
  return {
    direction: 'inbound',
    senderType: 'user',
    status: 'delivered',
    createdAt: new Date('2026-08-28T10:00:00Z'),
    ...partial,
  };
}

describe('inboxMessageCache', () => {
  it('C5: INSERT appends a single message without dropping history', () => {
    const current = [msg({ id: '1', messageBody: 'hola' })];
    const next = applyInboxMessageEvent(current, {
      eventType: 'INSERT',
      new: msg({
        id: '2',
        messageBody: 'nuevo',
        createdAt: new Date('2026-08-28T10:01:00Z'),
      }),
    });
    expect(next.map((m) => m.id)).toEqual(['1', '2']);
  });

  it('C11: confirmed realtime row replaces the optimistic bubble with the same clientRequestId', () => {
    const optimistic = msg({
      id: 'opt_1',
      direction: 'outbound',
      senderType: 'agent',
      messageBody: 'ok',
      clientRequestId: 'req-1',
      status: 'pending',
    });
    const confirmed = msg({
      id: 'db-9',
      direction: 'outbound',
      senderType: 'agent',
      messageBody: 'ok',
      clientRequestId: 'req-1',
      waMessageId: 'wamid.1',
      status: 'sent',
      createdAt: new Date('2026-08-28T10:02:00Z'),
    });
    const next = mergeInboxMessages([optimistic], [confirmed]);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('db-9');
    expect(next[0].waMessageId).toBe('wamid.1');
  });

  it('C12: failed send marks the optimistic bubble without removing it', () => {
    const current = [msg({ id: 'opt_1', status: 'pending', direction: 'outbound', senderType: 'agent' })];
    const next = markOptimisticFailed(current, 'opt_1', 'Meta down');
    expect(next[0].status).toBe('failed');
    expect(next[0].errorMessage).toBe('Meta down');
  });

  it('reconciles by server id when send returns before realtime', () => {
    const current = [msg({ id: 'opt_1', messageBody: 'hola', clientRequestId: 'req-2' })];
    const next = reconcileOptimisticMessage(current, 'opt_1', {
      id: 'db-2',
      waMessageId: 'wamid.2',
      status: 'sent',
      clientRequestId: 'req-2',
    });
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('db-2');
    expect(next[0].messageBody).toBe('hola');
  });

  it('prepending older pages keeps chronological order and dedupes', () => {
    const current = [msg({ id: '2', createdAt: new Date('2026-08-28T12:00:00Z') })];
    const older = [
      msg({ id: '1', createdAt: new Date('2026-08-28T11:00:00Z') }),
      msg({ id: '2', createdAt: new Date('2026-08-28T12:00:00Z') }),
    ];
    const next = prependOlderMessages(current, older);
    expect(next.map((m) => m.id)).toEqual(['1', '2']);
  });

  it('hasMoreMessages is true at a full page', () => {
    expect(hasMoreMessages(200)).toBe(true);
    expect(hasMoreMessages(40)).toBe(false);
  });
});
