import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listWhatsAppTemplatePresets,
  type WhatsAppSnippet,
  type WhatsAppTemplatePreset,
  type WhatsAppTemplateSummary,
} from '@/services/whatsappService';
import { resolveWhatsAppTemplatePanelSection } from '@/constants/whatsappTemplateSections';
import { previewTextForList } from '@/utils/whatsappTemplateHelpers';
import { getTemplateDisplayName } from './templateDisplayNames';
import { useMetaTemplates } from './useMetaTemplates';
import type { MetaCategoryFilter, TemplateLibraryTab } from './templateLibraryTypes';

export function useTemplateLibrary(wabaId: string | undefined, snippets: WhatsAppSnippet[] = []) {
  const meta = useMetaTemplates(wabaId);
  const [presets, setPresets] = useState<WhatsAppTemplatePreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TemplateLibraryTab>('favorites');
  const [metaCategory, setMetaCategory] = useState<MetaCategoryFilter>('ALL');
  const [prosavisSection, setProsavisSection] = useState<string | 'ALL'>('ALL');

  const loadPresets = useCallback(async () => {
    setPresetsLoading(true);
    setPresetsError(null);
    try {
      const list = await listWhatsAppTemplatePresets();
      setPresets(list);
    } catch (e: unknown) {
      setPresetsError(e instanceof Error ? e.message : 'No se pudieron cargar los pre-rellenos');
    } finally {
      setPresetsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  const pinnedSnippets = useMemo(
    () =>
      [...snippets]
        .filter((snippet) => snippet.isPinned)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [snippets],
  );

  const favoritePresets = useMemo(
    () => presets.filter((preset) => preset.isFavorite),
    [presets],
  );

  const matchesSearch = useCallback(
    (template: WhatsAppTemplateSummary) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      const displayName = getTemplateDisplayName(template.name).toLowerCase();
      const preview = previewTextForList(template).toLowerCase();
      return (
        template.name.toLowerCase().includes(query) ||
        displayName.includes(query) ||
        preview.includes(query)
      );
    },
    [search],
  );

  const filteredTemplates = useMemo(() => {
    let list = meta.templates.filter(matchesSearch);
    if (activeTab === 'meta' && metaCategory !== 'ALL') {
      list = list.filter((template) => {
        const category = (template.category || '').toUpperCase();
        return category === metaCategory;
      });
    }
    if (activeTab === 'prosavis' && prosavisSection !== 'ALL') {
      list = list.filter(
        (template) =>
          resolveWhatsAppTemplatePanelSection(template.name, template.category) === prosavisSection,
      );
    }
    return list;
  }, [activeTab, matchesSearch, meta.templates, metaCategory, prosavisSection]);

  const filteredSnippets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return snippets;
    return snippets.filter(
      (snippet) =>
        snippet.shortcut.toLowerCase().includes(query) ||
        snippet.label.toLowerCase().includes(query) ||
        snippet.body.toLowerCase().includes(query),
    );
  }, [search, snippets]);

  const filteredPresets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return favoritePresets;
    return favoritePresets.filter((preset) => {
      const template = meta.templateByKey.get(`${preset.templateName}:${preset.templateLanguage}`);
      return (
        preset.presetLabel.toLowerCase().includes(query) ||
        preset.templateName.toLowerCase().includes(query) ||
        getTemplateDisplayName(preset.templateName).toLowerCase().includes(query) ||
        (template ? previewTextForList(template).toLowerCase().includes(query) : false)
      );
    });
  }, [favoritePresets, meta.templateByKey, search]);

  const proSavisGroups = useMemo(
    () => meta.groupByProSavis(filteredTemplates),
    [filteredTemplates, meta],
  );

  const metaGroups = useMemo(
    () => meta.groupByMetaCategory(filteredTemplates),
    [filteredTemplates, meta],
  );

  const resolveTemplate = useCallback(
    (templateName: string, templateLanguage: string) =>
      meta.templateByKey.get(`${templateName}:${templateLanguage}`) ?? null,
    [meta.templateByKey],
  );

  return {
    ...meta,
    presets,
    presetsLoading,
    presetsError,
    reloadPresets: loadPresets,
    loading: meta.loading || presetsLoading,
    error: meta.error || presetsError,
    search,
    setSearch,
    activeTab,
    setActiveTab,
    metaCategory,
    setMetaCategory,
    prosavisSection,
    setProsavisSection,
    filteredTemplates,
    filteredSnippets,
    filteredPresets,
    pinnedSnippets,
    favoritePresets,
    proSavisGroups,
    metaGroups,
    resolveTemplate,
    metaCategorySections: meta.metaCategorySections,
  };
}
