import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listWhatsAppMessageTemplates,
  type WhatsAppTemplateSummary,
} from '@/services/whatsappService';
import {
  WHATSAPP_TEMPLATE_SECTIONS,
  getWhatsAppTemplateSectionOrder,
  resolveWhatsAppTemplatePanelSection,
  type WhatsAppTemplatePanelSection,
} from '@/constants/whatsappTemplateSections';
import { resolveTemplateCategory } from '@/components/whatsapp/WhatsAppTemplateCategoryChip';
import { filterApprovedSpanishTemplates } from '@/utils/whatsappTemplateSuggestions';
import type { GroupedMetaTemplates, MetaCategoryFilter } from './templateLibraryTypes';

type TemplateCategoryKey = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | 'UNKNOWN';

function categorySortOrder(key: TemplateCategoryKey): number {
  switch (key) {
    case 'UTILITY':
      return 0;
    case 'AUTHENTICATION':
      return 1;
    case 'MARKETING':
      return 2;
    default:
      return 3;
  }
}

const META_CATEGORY_SECTIONS: Array<{ key: MetaCategoryFilter; label: string }> = [
  { key: 'ALL', label: 'Todas' },
  { key: 'UTILITY', label: 'Utilidad' },
  { key: 'MARKETING', label: 'Marketing' },
  { key: 'AUTHENTICATION', label: 'Autenticación' },
];

function sortTemplates(templates: WhatsAppTemplateSummary[]): WhatsAppTemplateSummary[] {
  return [...templates].sort((a, b) => {
    const sa = resolveWhatsAppTemplatePanelSection(a.name, a.category);
    const sb = resolveWhatsAppTemplatePanelSection(b.name, b.category);
    const sectionOrderDiff = getWhatsAppTemplateSectionOrder(sa) - getWhatsAppTemplateSectionOrder(sb);
    if (sectionOrderDiff !== 0) return sectionOrderDiff;
    const ca = categorySortOrder(resolveTemplateCategory(a.category));
    const cb = categorySortOrder(resolveTemplateCategory(b.category));
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name, 'es');
  });
}

export function groupTemplatesByProsavisSection(
  templates: WhatsAppTemplateSummary[],
): GroupedMetaTemplates[] {
  const grouped = new Map<WhatsAppTemplatePanelSection, WhatsAppTemplateSummary[]>();
  for (const template of templates) {
    const section = resolveWhatsAppTemplatePanelSection(template.name, template.category);
    const list = grouped.get(section) ?? [];
    list.push(template);
    grouped.set(section, list);
  }

  return WHATSAPP_TEMPLATE_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    description: section.description,
    templates: grouped.get(section.key) ?? [],
  })).filter((group) => group.templates.length > 0);
}

export function groupTemplatesByMetaCategory(
  templates: WhatsAppTemplateSummary[],
): GroupedMetaTemplates[] {
  const grouped = new Map<MetaCategoryFilter, WhatsAppTemplateSummary[]>();
  for (const template of templates) {
    const category = resolveTemplateCategory(template.category);
    const key: MetaCategoryFilter =
      category === 'UTILITY' || category === 'MARKETING' || category === 'AUTHENTICATION'
        ? category
        : 'UTILITY';
    const list = grouped.get(key) ?? [];
    list.push(template);
    grouped.set(key, list);
  }

  return META_CATEGORY_SECTIONS.filter((section) => section.key !== 'ALL')
    .map((section) => ({
      key: section.key,
      label: section.label,
      templates: grouped.get(section.key) ?? [],
    }))
    .filter((group) => group.templates.length > 0);
}

export function useMetaTemplates(wabaId: string | undefined) {
  const [templates, setTemplates] = useState<WhatsAppTemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!wabaId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listWhatsAppMessageTemplates(wabaId);
      setTemplates(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar las plantillas');
    } finally {
      setLoading(false);
    }
  }, [wabaId]);

  useEffect(() => {
    void load();
  }, [load]);

  const approvedSpanishTemplates = useMemo(
    () => sortTemplates(filterApprovedSpanishTemplates(templates)),
    [templates],
  );

  const templateByKey = useMemo(() => {
    const map = new Map<string, WhatsAppTemplateSummary>();
    for (const template of approvedSpanishTemplates) {
      map.set(`${template.name}:${template.language}`, template);
    }
    return map;
  }, [approvedSpanishTemplates]);

  return {
    templates: approvedSpanishTemplates,
    templateByKey,
    loading,
    error,
    reload: load,
    groupByProsavis: groupTemplatesByProsavisSection,
    groupByMetaCategory: groupTemplatesByMetaCategory,
    metaCategorySections: META_CATEGORY_SECTIONS,
  };
}
