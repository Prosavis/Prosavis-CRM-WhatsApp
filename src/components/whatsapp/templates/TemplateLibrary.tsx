import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  InputAdornment,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import {
  createWhatsAppTemplatePreset,
  sendWhatsAppTemplateMessageAdmin,
  updateWhatsAppSnippet,
  type WhatsAppTemplateSummary,
} from '@/services/whatsappService';
import {
  buildDisplayMessageBody,
  buildTemplateSendComponents,
  previewTextForList,
} from '@/utils/whatsappTemplateHelpers';
import { selectWhatsAppTemplateSuggestion } from '@/utils/whatsappTemplateSuggestions';
import MetaTemplateCard from './MetaTemplateCard';
import MetaTemplateEditor from './MetaTemplateEditor';
import SavePresetDialog from './SavePresetDialog';
import SnippetLibraryList from './SnippetLibraryList';
import TemplatePresetCard from './TemplatePresetCard';
import TemplateSectionChips from './TemplateSectionChips';
import { getTemplateDisplayName } from './templateDisplayNames';
import { buildInitialTemplateValues } from './templateValueUtils';
import type {
  TemplateLibraryProps,
  TemplateLibraryTab,
  TemplateVariableValues,
} from './templateLibraryTypes';
import { useTemplateLibrary } from './useTemplateLibrary';

function templateKey(template: WhatsAppTemplateSummary): string {
  return `${template.name}:${template.language}`;
}

const TemplateLibrary: React.FC<TemplateLibraryProps> = (props) => {
  const { wabaId, snippets = [], onSnippetsChanged, suggestionContext, compact } = props;
  const library = useTemplateLibrary(wabaId, snippets);

  const [activeTemplate, setActiveTemplate] = useState<WhatsAppTemplateSummary | null>(null);
  const [editorValues, setEditorValues] = useState<TemplateVariableValues>({ header: [], body: [] });
  const [editorReason, setEditorReason] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);

  const suggestion = useMemo(() => {
    if (!suggestionContext || library.templates.length === 0) return null;
    return selectWhatsAppTemplateSuggestion(library.templates, suggestionContext);
  }, [library.templates, suggestionContext]);

  useEffect(() => {
    if (props.mode !== 'booking' || !props.initialTemplate) return;
    setActiveTemplate(props.initialTemplate);
    setEditorValues(
      buildInitialTemplateValues(props.initialTemplate, {
        suggestion: props.initialValues
          ? { headerValues: props.initialValues.header, bodyValues: props.initialValues.body }
          : suggestion,
      }),
    );
    setEditorReason(props.suggestionReason ?? suggestion?.reason ?? null);
  }, [props, suggestion]);

  const openTemplateEditor = useCallback(
    (
      template: WhatsAppTemplateSummary,
      options?: {
        presetValues?: TemplateVariableValues;
        reason?: string | null;
      },
    ) => {
      setActiveTemplate(template);
      setEditorValues(
        buildInitialTemplateValues(template, {
          preset: options?.presetValues
            ? {
                id: '',
                presetLabel: '',
                templateName: template.name,
                templateLanguage: template.language,
                headerValues: options.presetValues.header,
                bodyValues: options.presetValues.body,
                isFavorite: true,
                sortOrder: 0,
              }
            : null,
          suggestion:
            suggestion?.template.name === template.name
              ? { headerValues: suggestion.headerValues, bodyValues: suggestion.bodyValues }
              : null,
        }),
      );
      setEditorReason(options?.reason ?? null);
      setSendError(null);
    },
    [suggestion],
  );

  const handleBack = useCallback(() => {
    setActiveTemplate(null);
    setSendError(null);
  }, []);

  const handleSend = useCallback(async () => {
    if (!activeTemplate) return;
    if (props.mode !== 'inbox' && props.mode !== 'booking') return;
    if (!props.phoneNumberId || !props.recipientPhone) return;

    const components = buildTemplateSendComponents(
      activeTemplate,
      editorValues.header,
      editorValues.body,
    );
    const displayMessageBody = buildDisplayMessageBody(
      activeTemplate,
      editorValues.header,
      editorValues.body,
    );

    setSending(true);
    setSendError(null);
    try {
      await sendWhatsAppTemplateMessageAdmin({
        recipientPhone: props.recipientPhone,
        phoneNumberId: props.phoneNumberId,
        templateName: activeTemplate.name,
        templateLanguage: activeTemplate.language,
        components: components.length > 0 ? components : undefined,
        displayMessageBody,
      });
      setActiveTemplate(null);
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : 'Error al enviar');
    } finally {
      setSending(false);
    }
  }, [activeTemplate, editorValues.body, editorValues.header, props]);

  const handleConfirmSelect = useCallback(() => {
    if (!activeTemplate || props.mode !== 'bulk') return;
    props.onSelect(activeTemplate, editorValues);
    setActiveTemplate(null);
  }, [activeTemplate, editorValues, props]);

  const handleSavePreset = useCallback(
    async (presetLabel: string) => {
      if (!activeTemplate) return;
      setSavingPreset(true);
      setSaveError(null);
      try {
        await createWhatsAppTemplatePreset({
          presetLabel,
          templateName: activeTemplate.name,
          templateLanguage: activeTemplate.language,
          headerValues: editorValues.header,
          bodyValues: editorValues.body,
          isFavorite: true,
        });
        await library.reloadPresets();
        setSaveDialogOpen(false);
      } catch (e: unknown) {
        setSaveError(e instanceof Error ? e.message : 'No se pudo guardar el pre-relleno');
      } finally {
        setSavingPreset(false);
      }
    },
    [activeTemplate, editorValues.body, editorValues.header, library],
  );

  const handleToggleSnippetPin = useCallback(
    async (snippet: (typeof snippets)[number]) => {
      await updateWhatsAppSnippet(snippet.id, { isPinned: !snippet.isPinned });
      onSnippetsChanged?.();
      await library.reloadPresets();
    },
    [library, onSnippetsChanged],
  );

  const handleInsertSnippet = useCallback(
    (snippet: (typeof snippets)[number]) => {
      if (props.mode === 'inbox' || props.mode === 'booking') {
        props.onApplyDraft?.(snippet.body);
      }
    },
    [props],
  );

  const panelWidth = compact ? '100%' : { xs: '100%', md: 400 };
  const sectionChips = useMemo(
    () =>
      library.metaCategorySections
        .map((section) => ({
          key: section.key,
          label: section.label,
          count: library.categoryCounts[section.key] ?? 0,
        }))
        .filter((section) => section.key === 'ALL' || section.count > 0),
    [library.categoryCounts, library.metaCategorySections],
  );

  const renderTemplateGroups = () => {
    const groups =
      library.metaCategory === 'ALL'
        ? library.metaGroups
        : library.metaGroups.filter((group) => group.key === library.metaCategory);
    return groups.map((group) => (
      <Box key={group.key} sx={{ mb: 2 }}>
        <Typography
          variant="overline"
          color="text.secondary"
          display="block"
          sx={{ letterSpacing: 0.6, lineHeight: 2 }}
        >
          {group.label}
        </Typography>
        {group.templates.map((template) => (
          <MetaTemplateCard
            key={templateKey(template)}
            template={template}
            selected={
              props.mode === 'bulk' &&
              props.selectedTemplate?.name === template.name &&
              props.selectedTemplate?.language === template.language
            }
            onClick={() => openTemplateEditor(template)}
          />
        ))}
      </Box>
    ));
  };

  const favoritesContent = (
    <Box>
      {library.presetsError && (
        <Alert severity="warning" variant="outlined" sx={{ mb: 1.5 }}>
          No se pudieron cargar los pre-rellenos del equipo.
        </Alert>
      )}

      {library.filteredPresets.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" fontWeight={700} display="block" sx={{ mb: 0.75 }}>
            Pre-rellenos del equipo
          </Typography>
          {library.filteredPresets.map((preset) => {
            const template = library.resolveTemplate(preset.templateName, preset.templateLanguage);
            return (
              <TemplatePresetCard
                key={preset.id}
                preset={preset}
                preview={template ? previewTextForList(template) : undefined}
                onClick={() => {
                  if (!template) return;
                  openTemplateEditor(template, {
                    presetValues: { header: preset.headerValues, body: preset.bodyValues },
                    reason: `Pre-relleno: ${preset.presetLabel}`,
                  });
                }}
              />
            );
          })}
        </Box>
      )}

      {library.pinnedSnippets.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" fontWeight={700} display="block" sx={{ mb: 0.75 }}>
            Atajos CRM anclados
          </Typography>
          <SnippetLibraryList
            snippets={library.pinnedSnippets}
            onInsert={handleInsertSnippet}
            onTogglePin={handleToggleSnippetPin}
          />
        </Box>
      )}

      {suggestion && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" fontWeight={700} display="block" sx={{ mb: 0.75 }}>
            Sugerida para este chat
          </Typography>
          <MetaTemplateCard
            template={suggestion.template}
            subtitle={suggestion.reason}
            onClick={() =>
              openTemplateEditor(suggestion.template, { reason: suggestion.reason })
            }
          />
        </Box>
      )}

      {library.filteredPresets.length === 0 &&
        library.pinnedSnippets.length === 0 &&
        !suggestion && (
          <Typography variant="body2" color="text.secondary">
            Aún no hay favoritos del equipo. Guarda un pre-relleno desde cualquier plantilla Meta.
          </Typography>
        )}
    </Box>
  );

  return (
    <Box
      sx={{
        width: panelWidth,
        minWidth: compact ? undefined : 320,
        maxWidth: compact ? undefined : 420,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: compact ? 0 : 1,
        borderColor: 'divider',
        bgcolor: 'background.default',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Typography variant="subtitle2" fontWeight={700}>
          Biblioteca de mensajes
        </Typography>
        {props.mode === 'inbox' && (
          <Typography variant="caption" color="text.secondary" display="block" noWrap title={props.recipientPhone}>
            A: {props.recipientPhone}
          </Typography>
        )}
      </Box>

      {activeTemplate ? (
        <Box sx={{ flex: 1, overflow: 'hidden', p: 1.5 }}>
          <MetaTemplateEditor
            mode={props.mode}
            template={activeTemplate}
            values={editorValues}
            onValuesChange={setEditorValues}
            onBack={handleBack}
            suggestionReason={editorReason}
            sending={sending}
            sendError={sendError}
            onSend={
              props.mode === 'inbox' || props.mode === 'booking' ? () => void handleSend() : undefined
            }
            onApplyDraft={
              props.mode === 'inbox' || props.mode === 'booking'
                ? props.onApplyDraft
                : undefined
            }
            onConfirmSelect={props.mode === 'bulk' ? handleConfirmSelect : undefined}
            onSavePreset={() => {
              setSaveError(null);
              setSaveDialogOpen(true);
            }}
          />
        </Box>
      ) : (
        <>
          <Box sx={{ px: 1.5, pt: 1 }}>
            <Tabs
              value={library.activeTab}
              onChange={(_, value: TemplateLibraryTab) => library.setActiveTab(value)}
              variant="fullWidth"
              sx={{
                minHeight: 38,
                mb: 1,
                '& .MuiTab-root': {
                  minHeight: 38,
                  py: 0.5,
                  textTransform: 'none',
                  fontWeight: 600,
                },
              }}
            >
              <Tab value="favorites" label="Favoritos" />
              <Tab value="templates" label="Plantillas" />
            </Tabs>

            <TextField
              fullWidth
              size="small"
              placeholder={
                library.activeTab === 'favorites' ? 'Buscar favorito...' : 'Buscar plantilla...'
              }
              value={library.search}
              onChange={(event) => library.setSearch(event.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 1 }}
            />
          </Box>

          <Box sx={{ flex: 1, overflow: 'auto', px: 1.5, pb: 1.5 }}>
            {library.metaError && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {library.metaError}
              </Alert>
            )}

            {library.loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : library.activeTab === 'favorites' ? (
              favoritesContent
            ) : (
              <>
                <TemplateSectionChips
                  sections={sectionChips}
                  activeKey={library.metaCategory}
                  onChange={(key) =>
                    library.setMetaCategory(key as typeof library.metaCategory)
                  }
                />
                {library.filteredTemplates.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No hay plantillas que coincidan con la búsqueda.
                  </Typography>
                ) : (
                  renderTemplateGroups()
                )}
              </>
            )}
          </Box>
        </>
      )}

      <SavePresetDialog
        open={saveDialogOpen}
        defaultLabel={
          activeTemplate ? `${getTemplateDisplayName(activeTemplate.name)} · equipo` : ''
        }
        saving={savingPreset}
        error={saveError}
        onClose={() => !savingPreset && setSaveDialogOpen(false)}
        onSave={(label) => void handleSavePreset(label)}
      />
    </Box>
  );
};

export default TemplateLibrary;
