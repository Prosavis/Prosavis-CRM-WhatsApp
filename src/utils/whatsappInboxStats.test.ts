import { describe, expect, it } from 'vitest';
import type { WhatsAppConversation } from '@/services/whatsappService';
import {
  computeArchivedTagCounts,
  computeTabCounts,
  computeTagCounts,
  computeWhatsAppInboxMetrics,
} from './whatsappInboxStats';

const TAG_A = '11111111-1111-1111-1111-111111111111';
const TAG_B = '22222222-2222-2222-2222-222222222222';

function mockConversation(
  partial: Partial<WhatsAppConversation> & { id: string },
): WhatsAppConversation {
  return {
    state: 'active',
    unreadCount: 0,
    ...partial,
  };
}

describe('whatsappInboxStats', () => {
  it('cuenta tag solo en archivadas: activas 0, archivadas N', () => {
    const conversations: WhatsAppConversation[] = [
      mockConversation({ id: 'c1', isArchived: true, tagIds: [TAG_A] }),
      mockConversation({ id: 'c2', isArchived: true, tagIds: [TAG_A] }),
      mockConversation({ id: 'c3', isArchived: true, tagIds: [TAG_A] }),
    ];

    expect(computeTagCounts(conversations)[TAG_A]).toBeUndefined();
    expect(computeArchivedTagCounts(conversations)[TAG_A]).toBe(3);
  });

  it('separa conteos activos y archivados para el mismo tag', () => {
    const conversations: WhatsAppConversation[] = [
      mockConversation({ id: 'active-1', tagIds: [TAG_A] }),
      mockConversation({ id: 'active-2', tagIds: [TAG_A, TAG_B] }),
      mockConversation({ id: 'archived-1', isArchived: true, tagIds: [TAG_A] }),
      mockConversation({ id: 'archived-2', isArchived: true, tagIds: [TAG_B] }),
    ];

    expect(computeTagCounts(conversations)[TAG_A]).toBe(2);
    expect(computeTagCounts(conversations)[TAG_B]).toBe(1);
    expect(computeArchivedTagCounts(conversations)[TAG_A]).toBe(1);
    expect(computeArchivedTagCounts(conversations)[TAG_B]).toBe(1);
  });

  it('tabCounts.tagged solo cuenta activas con cualquier tag', () => {
    const conversations: WhatsAppConversation[] = [
      mockConversation({ id: 'active-tagged', tagIds: [TAG_A] }),
      mockConversation({ id: 'active-no-tag' }),
      mockConversation({ id: 'archived-tagged', isArchived: true, tagIds: [TAG_A] }),
    ];

    const tabCounts = computeTabCounts(conversations);
    expect(tabCounts.tagged).toBe(1);
    expect(tabCounts.all).toBe(2);
    expect(tabCounts.archived).toBe(1);
  });

  it('computeWhatsAppInboxMetrics expone ambos mapas de tags', () => {
    const conversations: WhatsAppConversation[] = [
      mockConversation({ id: 'a1', tagIds: [TAG_A] }),
      mockConversation({ id: 'a2', isArchived: true, tagIds: [TAG_A] }),
    ];

    const metrics = computeWhatsAppInboxMetrics(conversations);
    expect(metrics.tagCountsById[TAG_A]).toBe(1);
    expect(metrics.archivedTagCountsById[TAG_A]).toBe(1);
    expect(metrics.totalConversations).toBe(2);
  });
});
