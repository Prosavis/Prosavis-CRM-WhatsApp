import { describe, expect, it } from 'vitest';
import type { WhatsAppConversation } from '@/services/whatsappService';
import {
  collectCategoryOwnedTagIds,
  computeArchivedTagCounts,
  computeTabCounts,
  computeTagCounts,
  computeWhatsAppInboxMetrics,
  conversationMatchesInboxCategory,
  getSecondaryFilterTags,
  resolveAllCategoryTagIds,
  resolveCategoryTagIds,
} from './whatsappInboxStats';

const TAG_A = '11111111-1111-1111-1111-111111111111';
const TAG_B = '22222222-2222-2222-2222-222222222222';
const TAG_AGENDADO = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TAG_COBERTURA = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TAG_TRABAJO = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
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

const catalog = [
  { id: TAG_A, name: 'Cerritos' },
  { id: TAG_B, name: 'Premium' },
  { id: TAG_AGENDADO, name: 'Agendado' },
  { id: TAG_COBERTURA, name: 'Fuera de cobertura' },
  { id: TAG_TRABAJO, name: 'Trabajo / CV' },
  { id: TAG_EMPRESAS, name: 'Empresas' },
];

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

  it('tabCounts cuenta categorías de negocio por tags del catálogo', () => {
    const conversations: WhatsAppConversation[] = [
      mockConversation({ id: 'a1', tagIds: [TAG_AGENDADO] }),
      mockConversation({ id: 'a2', tagIds: [TAG_AGENDADO, TAG_COBERTURA] }),
      mockConversation({ id: 'a3', tagIds: [TAG_TRABAJO] }),
      mockConversation({ id: 'a4', tagIds: [TAG_A] }),
      mockConversation({ id: 'a5', tagIds: [TAG_EMPRESAS] }),
      mockConversation({ id: 'arch', isArchived: true, tagIds: [TAG_AGENDADO] }),
    ];

    const tabCounts = computeTabCounts(conversations, catalog);
    expect(tabCounts.agendados).toBe(2);
    expect(tabCounts.fueraCobertura).toBe(1);
    expect(tabCounts.trabajo).toBe(1);
    expect(tabCounts.empresas).toBe(1);
    expect(tabCounts.all).toBe(5);
    expect(tabCounts.archived).toBe(1);
  });

  it('trabajo resuelve Marian y Job; fuera_cobertura acepta override de ciudades', () => {
    const TAG_MARIAN = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const TAG_JOB = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const TAG_BOGOTA = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    const localCatalog = [
      { id: TAG_MARIAN, name: 'Marian' },
      { id: TAG_JOB, name: 'Job' },
      { id: TAG_BOGOTA, name: 'Bogotá' },
      { id: TAG_A, name: 'Cerritos' },
    ];
    const conversations: WhatsAppConversation[] = [
      mockConversation({ id: 'm1', tagIds: [TAG_MARIAN] }),
      mockConversation({ id: 'j1', tagIds: [TAG_JOB] }),
      mockConversation({ id: 'b1', tagIds: [TAG_BOGOTA] }),
      mockConversation({ id: 'c1', tagIds: [TAG_A] }),
    ];

    const byAlias = computeTabCounts(conversations, localCatalog);
    expect(byAlias.trabajo).toBe(2);
    expect(byAlias.fueraCobertura).toBe(1);

    const withOverride = resolveAllCategoryTagIds(localCatalog, {
      fuera_cobertura: [TAG_BOGOTA],
    });
    expect(withOverride.fuera_cobertura).toEqual([TAG_BOGOTA]);
    expect(withOverride.trabajo.sort()).toEqual([TAG_MARIAN, TAG_JOB].sort());
  });

  it('resolveCategoryTagIds acepta aliases case-insensitive', () => {
    const tags = [
      { id: '1', name: 'AGENDADOS' },
      { id: '2', name: 'Marian' },
      { id: '3', name: '  Bogotá ' },
      { id: '4', name: 'EMPRESAS' },
    ];
    expect(resolveCategoryTagIds('agendados', tags)).toEqual(['1']);
    expect(resolveCategoryTagIds('trabajo', tags)).toEqual(['2']);
    expect(resolveCategoryTagIds('fuera_cobertura', tags)).toEqual(['3']);
    expect(resolveCategoryTagIds('empresas', tags)).toEqual(['4']);
  });

  it('conversationMatchesInboxCategory: chat con varios tags aparece en cada categoría activa', () => {
    const c = mockConversation({
      id: 'multi',
      tagIds: [TAG_AGENDADO, TAG_COBERTURA, TAG_EMPRESAS],
    });
    const categoryTagIds = resolveAllCategoryTagIds(catalog);
    expect(conversationMatchesInboxCategory(c, 'agendados', categoryTagIds)).toBe(true);
    expect(conversationMatchesInboxCategory(c, 'fuera_cobertura', categoryTagIds)).toBe(true);
    expect(conversationMatchesInboxCategory(c, 'trabajo', categoryTagIds)).toBe(false);
    expect(conversationMatchesInboxCategory(c, 'empresas', categoryTagIds)).toBe(true);
    expect(conversationMatchesInboxCategory(c, 'all', categoryTagIds)).toBe(true);
  });

  it('getSecondaryFilterTags excluye tags de categorías fijas', () => {
    const categoryTagIds = resolveAllCategoryTagIds(catalog);
    const secondary = getSecondaryFilterTags(catalog, categoryTagIds);
    expect(secondary.map((t) => t.id).sort()).toEqual([TAG_A, TAG_B].sort());
    expect(collectCategoryOwnedTagIds(categoryTagIds).has(TAG_AGENDADO)).toBe(true);
    expect(collectCategoryOwnedTagIds(categoryTagIds).has(TAG_EMPRESAS)).toBe(true);
  });

  it('computeWhatsAppInboxMetrics expone categoryTagIds y mapas de tags', () => {
    const conversations: WhatsAppConversation[] = [
      mockConversation({ id: 'a1', tagIds: [TAG_A] }),
      mockConversation({ id: 'a2', isArchived: true, tagIds: [TAG_A] }),
    ];

    const metrics = computeWhatsAppInboxMetrics(conversations, catalog);
    expect(metrics.tagCountsById[TAG_A]).toBe(1);
    expect(metrics.archivedTagCountsById[TAG_A]).toBe(1);
    expect(metrics.totalConversations).toBe(2);
    expect(metrics.categoryTagIds.agendados).toEqual([TAG_AGENDADO]);
  });
});
