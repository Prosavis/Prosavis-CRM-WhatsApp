import { describe, expect, it } from 'vitest';
import {
  conversationMatchesInboxCategory,
  resolveAllCategoryTagIds,
  resolveCategoryTagIds,
} from './whatsappInboxStats';
import type { WhatsAppConversation } from '@/services/whatsappService';

const TAG_EMPRESAS = '656473d8-4ae3-4c53-a5e3-81d9217537c2';

function mockConversation(
  partial: Partial<WhatsAppConversation> & { id: string },
): WhatsAppConversation {
  return {
    state: 'active',
    unreadCount: 0,
    ...partial,
  };
}

describe('empresas category (tag-only)', () => {
  it('resuelve solo el tag Empresas', () => {
    const tags = [
      { id: TAG_EMPRESAS, name: 'Empresas' },
      { id: '1', name: 'Empresa' },
      { id: '2', name: 'company' },
    ];
    expect(resolveCategoryTagIds('empresas', tags)).toEqual([TAG_EMPRESAS]);
  });

  it('filtra conversaciones con tag Empresas', () => {
    const catalog = [{ id: TAG_EMPRESAS, name: 'Empresas' }];
    const categoryTagIds = resolveAllCategoryTagIds(catalog);
    const withTag = mockConversation({ id: 'e1', tagIds: [TAG_EMPRESAS] });
    const without = mockConversation({ id: 'e2', tagIds: [] });
    expect(conversationMatchesInboxCategory(withTag, 'empresas', categoryTagIds)).toBe(true);
    expect(conversationMatchesInboxCategory(without, 'empresas', categoryTagIds)).toBe(false);
  });
});
