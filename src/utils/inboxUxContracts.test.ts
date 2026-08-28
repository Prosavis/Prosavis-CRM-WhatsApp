import { describe, expect, it } from 'vitest';
import type { WhatsAppMessage } from '@/services/whatsappService';
import {
  hasMoreMessages,
  markOptimisticFailed,
  mergeInboxMessages,
  prependOlderMessages,
} from './inboxMessageCache';
import {
  getComposerDraft,
  setComposerDraft,
  clearComposerDraft,
  clearAllComposerDrafts,
} from './messageComposerDraftStore';

function msg(partial: Partial<WhatsAppMessage> & { id: string }): WhatsAppMessage {
  return {
    direction: 'outbound',
    senderType: 'agent',
    status: 'pending',
    createdAt: new Date('2026-08-28T10:00:00Z'),
    ...partial,
  };
}

describe('inbox UX contracts H', () => {
  it('H1: optimistic bubble appears before ack', () => {
    const optimistic = msg({ id: 'opt_h1', clientRequestId: 'h1', messageBody: 'hola' });
    const next = mergeInboxMessages([], [optimistic]);
    expect(next[0].id).toBe('opt_h1');
    expect(next[0].status).toBe('pending');
  });

  it('H2: failed send keeps the bubble', () => {
    const next = markOptimisticFailed(
      [msg({ id: 'opt_h2', status: 'pending' })],
      'opt_h2',
      'timeout',
    );
    expect(next[0].status).toBe('failed');
    expect(next[0].errorMessage).toBe('timeout');
  });

  it('H3: load-older prepends without dropping the latest page', () => {
    const latest = [msg({ id: 'new', createdAt: new Date('2026-08-28T12:00:00Z') })];
    const older = [msg({ id: 'old', createdAt: new Date('2026-08-28T09:00:00Z') })];
    expect(prependOlderMessages(latest, older).map((item) => item.id)).toEqual(['old', 'new']);
    expect(hasMoreMessages(200)).toBe(true);
  });

  it('H4: drafts survive a conversation switch and clear only on explicit all-clear', () => {
    setComposerDraft('chat-a', 'borrador A');
    setComposerDraft('chat-b', 'borrador B');
    expect(getComposerDraft('chat-a')).toBe('borrador A');
    clearComposerDraft('chat-b');
    expect(getComposerDraft('chat-a')).toBe('borrador A');
    expect(getComposerDraft('chat-b')).toBe('');
    clearAllComposerDrafts();
    expect(getComposerDraft('chat-a')).toBe('');
  });
});
