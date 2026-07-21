import { describe, expect, it } from 'vitest';
import type { WhatsAppAdminPresence } from '@/services/whatsappService';
import {
  dedupePresencesByUid,
  presenceStateToEntries,
  summarizePeerPresences,
} from '@/utils/whatsappAdminPresence';

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

  describe('presenceStateToEntries', () => {
    it('maps presenceState metas and keeps the freshest meta per uid', () => {
      const entries = presenceStateToEntries({
        admin_a: [
          {
            uid: 'admin_a',
            displayName: 'Marian',
            conversationId: '573000000001',
            activity: 'viewing',
            phoneNumberId: 'line-1',
            updatedAt: '2026-07-21T12:00:00.000Z',
          },
          {
            uid: 'admin_a',
            displayName: 'Marian',
            conversationId: '573000000002',
            activity: 'typing',
            phoneNumberId: 'line-1',
            updatedAt: '2026-07-21T12:01:00.000Z',
          },
        ],
        admin_b: [
          {
            uid: 'admin_b',
            displayName: 'Francy',
            conversationId: '573000000003',
            activity: 'viewing',
            phoneNumberId: 'line-1',
            updatedAt: '2026-07-21T12:00:30.000Z',
          },
        ],
      });

      expect(entries).toHaveLength(2);
      const a = entries.find((e) => e.uid === 'admin_a');
      const b = entries.find((e) => e.uid === 'admin_b');
      expect(a).toMatchObject({
        conversationId: '573000000002',
        activity: 'typing',
        displayName: 'Marian',
        phoneNumberId: 'line-1',
      });
      expect(b).toMatchObject({
        conversationId: '573000000003',
        activity: 'viewing',
        displayName: 'Francy',
      });
    });

    it('skips none activity, missing conversationId, and invalid metas', () => {
      const entries = presenceStateToEntries({
        ghost: [{ uid: 'ghost', activity: 'none', conversationId: 'x' }],
        empty: [{ uid: 'empty', activity: 'viewing', conversationId: '' }],
        bad: [{ foo: 'bar' }],
        ok: [
          {
            uid: 'ok',
            displayName: 'Admin',
            conversationId: '573000000099',
            activity: 'viewing',
            phoneNumberId: 'line-1',
            updatedAt: '2026-07-21T12:00:00.000Z',
          },
        ],
      });

      expect(entries).toEqual([
        expect.objectContaining({
          uid: 'ok',
          conversationId: '573000000099',
          activity: 'viewing',
        }),
      ]);
    });
  });
});
