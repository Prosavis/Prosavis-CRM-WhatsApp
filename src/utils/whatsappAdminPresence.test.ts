import { describe, expect, it } from 'vitest';
import type { WhatsAppAdminPresence } from '@/services/whatsappService';
import { dedupePresencesByUid, summarizePeerPresences } from '@/utils/whatsappAdminPresence';

function presence(
  partial: Partial<WhatsAppAdminPresence> & Pick<WhatsAppAdminPresence, 'uid' | 'activity'>,
): WhatsAppAdminPresence {
  return {
    displayName: partial.displayName ?? 'Admin',
    conversationId: partial.conversationId ?? '573000000000',
    updatedAt: partial.updatedAt ?? new Date(),
    ...partial,
  };
}

describe('whatsappAdminPresence', () => {
  it('dedupes by uid keeping the freshest row', () => {
    const older = presence({
      uid: 'a',
      displayName: 'Soporte Prosavis',
      activity: 'viewing',
      updatedAt: new Date('2026-07-10T12:00:00Z'),
    });
    const newer = presence({
      uid: 'a',
      displayName: 'Soporte Prosavis',
      activity: 'typing',
      updatedAt: new Date('2026-07-10T12:01:00Z'),
    });
    const other = presence({
      uid: 'b',
      displayName: 'Francy Olivera',
      activity: 'viewing',
    });

    expect(dedupePresencesByUid([older, newer, other])).toEqual([newer, other]);
  });

  it('concatenates viewing peers with display names', () => {
    const summary = summarizePeerPresences([
      presence({ uid: '1', displayName: 'Marian Neacsu', activity: 'viewing' }),
      presence({ uid: '2', displayName: 'Francy Olivera', activity: 'viewing' }),
    ]);
    expect(summary).toEqual({
      text: 'Marian Neacsu y Francy Olivera están viendo este chat',
      typing: false,
    });
  });

  it('prioritizes typing over viewing and concatenates typers', () => {
    const summary = summarizePeerPresences([
      presence({ uid: '1', displayName: 'Marian Neacsu', activity: 'viewing' }),
      presence({ uid: '2', displayName: 'Soporte Prosavis', activity: 'typing' }),
      presence({ uid: '3', displayName: 'Francy Olivera', activity: 'typing' }),
    ]);
    expect(summary).toEqual({
      text: 'Soporte Prosavis y Francy Olivera están escribiendo…',
      typing: true,
    });
  });
});
