import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Collapse,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material';
import ArticleIcon from '@mui/icons-material/Article';
import TemplateIcon from '@mui/icons-material/Description';
import { listWhatsAppMessageTemplates, type WhatsAppTemplateSummary } from '@/services/whatsappService';
import {
  WHATSAPP_TEMPLATE_SECTIONS,
  resolveWhatsAppTemplatePanelSection,
} from '@/constants/whatsappTemplateSections';
import WhatsAppTemplateCategoryChip from '@/components/whatsapp/WhatsAppTemplateCategoryChip';
import {
  applyPlaceholdersToText,
  buildDisplayMessageBody,
  countSlotsForTemplate,
  getComponentText,
  getExampleValues,
  previewTextForList,
} from '@/utils/whatsappTemplateHelpers';
import { getWhatsAppBubbleSx } from '@/utils/whatsappBubblePreview';
import type { BulkMessageState } from './bulkSendTypes';

export interface BulkSendMessageStepProps {
  wabaId: string;
  message: BulkMessageState;
  onMessageChange: (message: BulkMessageState) => void;
}

const BulkSendMessageStep: React.FC<BulkSendMessageStepProps> = ({
  wabaId,
  message,
  onMessageChange,
}) => {
  const theme = useTheme();
  const bubbleSx = getWhatsAppBubbleSx(theme);
  const [templates, setTemplates] = useState<WhatsAppTemplateSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    if (!wabaId) return;
    setLoading(true);
    setListError(null);
    try {
      const list = await listWhatsAppMessageTemplates(wabaId);
      setTemplates(list.filter((t) => t.status === 'APPROVED'));
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'No se pudieron cargar plantillas');
    } finally {
      setLoading(false);
    }
  }, [wabaId]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const filteredTemplates = useMemo(() => {
    const approved = templates.filter((t) => t.status === 'APPROVED');
    const esCo = approved.filter((t) => t.language === 'es_CO');
    const esAny = approved.filter((t) => typeof t.language === 'string' && t.language.startsWith('es'));
    const base = esCo.length ? esCo : esAny.length ? esAny : approved;
    return [...base];
  }, [templates]);

  const templatesBySection = useMemo(() => {
    const grouped = new Map<string, WhatsAppTemplateSummary[]>();
    for (const template of filteredTemplates) {
      const sectionKey = resolveWhatsAppTemplatePanelSection(template.name, template.category);
      const list = grouped.get(sectionKey) ?? [];
      list.push(template);
      grouped.set(sectionKey, list);
    }
    return WHATSAPP_TEMPLATE_SECTIONS.map((section) => ({
      section,
      templates: grouped.get(section.key) ?? [],
    })).filter((g) => g.templates.length > 0);
  }, [filteredTemplates]);

  const selectTemplate = (template: WhatsAppTemplateSummary) => {
    const id = `${template.name}:${template.language}`;
    const isOpen = expandedId === id;
    setExpandedId(isOpen ? null : id);
    if (!isOpen) {
      const { header, body } = countSlotsForTemplate(template);
      onMessageChange({
        ...message,
        mode: 'template',
        selectedTemplate: template,
        headerValues: getExampleValues(template.components, 'HEADER').slice(0, header),
        bodyValues: getExampleValues(template.components, 'BODY').slice(0, body),
      });
    }
  };

  const previewText = useMemo(() => {
    if (message.mode === 'text') {
      return message.text.trim() || 'Escribe tu mensaje…';
    }
    if (!message.selectedTemplate) {
      return 'Selecciona una plantilla aprobada por Meta';
    }
    return buildDisplayMessageBody(
      message.selectedTemplate,
      message.headerValues,
      message.bodyValues,
    );
  }, [message]);

  const templateSlots = message.selectedTemplate
    ? countSlotsForTemplate(message.selectedTemplate)
    : { header: 0, body: 0 };

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, minHeight: 0, flex: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <ToggleButtonGroup
          exclusive
          value={message.mode}
          onChange={(_, value) => {
            if (value) onMessageChange({ ...message, mode: value });
          }}
          size="small"
          sx={{ mb: 2 }}
        >
          <ToggleButton value="template" sx={{ textTransform: 'none', gap: 0.5 }}>
            <TemplateIcon fontSize="small" />
            Plantilla Meta
          </ToggleButton>
          <ToggleButton value="text" sx={{ textTransform: 'none', gap: 0.5 }}>
            <ArticleIcon fontSize="small" />
            Mensaje personalizado
          </ToggleButton>
        </ToggleButtonGroup>

        {message.mode === 'text' ? (
          <TextField
            fullWidth
            multiline
            rows={8}
            label="Mensaje"
            placeholder="Escribe el mensaje que recibirán todos los destinatarios..."
            value={message.text}
            onChange={(e) => onMessageChange({ ...message, text: e.target.value })}
            helperText={`${message.text.length} caracteres`}
          />
        ) : (
          <Box>
            {listError && (
              <Alert severity="error" sx={{ mb: 1 }} onClose={() => setListError(null)}>
                {listError}
              </Alert>
            )}
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : filteredTemplates.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No hay plantillas aprobadas en español.
              </Typography>
            ) : (
              templatesBySection.map(({ section, templates: sectionTemplates }) => (
                <Box key={section.key} sx={{ mb: 2 }}>
                  <Typography variant="caption" fontWeight={700} color="text.primary" display="block">
                    {section.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                    {section.description}
                  </Typography>
                  {sectionTemplates.map((t) => {
                    const id = `${t.name}:${t.language}`;
                    const isOpen = expandedId === id;
                    const isSelected = message.selectedTemplate?.name === t.name;
                    return (
                      <Box key={id} sx={{ mb: 1 }}>
                        <Box
                          onClick={() => selectTemplate(t)}
                          sx={{
                            cursor: 'pointer',
                            borderRadius: 1,
                            p: 1.25,
                            bgcolor: isSelected ? 'action.selected' : 'background.paper',
                            border: 2,
                            borderColor: isSelected ? 'primary.main' : 'divider',
                            '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
                          }}
                        >
                          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
                            <Typography variant="body2" fontWeight={600}>
                              {t.name}
                            </Typography>
                            <WhatsAppTemplateCategoryChip category={t.category} />
                            <Typography variant="caption" color="text.secondary">
                              ({t.language})
                            </Typography>
                          </Stack>
                          <Box sx={{ ...bubbleSx, mt: 1, fontSize: '0.8125rem' }}>
                            <Typography variant="body2" component="div" sx={{ fontSize: 'inherit' }}>
                              {previewTextForList(t)}
                            </Typography>
                          </Box>
                        </Box>
                        <Collapse in={isOpen && isSelected}>
                          <Box sx={{ pl: 1, pt: 1 }}>
                            {templateSlots.header > 0 && (
                              <Stack spacing={1} sx={{ mb: 1 }}>
                                <Typography variant="caption" fontWeight={600}>
                                  Variables del encabezado
                                </Typography>
                                {Array.from({ length: templateSlots.header }).map((_, i) => (
                                  <TextField
                                    key={`h-${i}`}
                                    size="small"
                                    fullWidth
                                    label={`Encabezado {{${i + 1}}}`}
                                    value={message.headerValues[i] ?? ''}
                                    onChange={(e) => {
                                      const next = [...message.headerValues];
                                      next[i] = e.target.value;
                                      onMessageChange({ ...message, headerValues: next });
                                    }}
                                  />
                                ))}
                              </Stack>
                            )}
                            {templateSlots.body > 0 && (
                              <Stack spacing={1}>
                                <Typography variant="caption" fontWeight={600}>
                                  Variables del cuerpo
                                </Typography>
                                {Array.from({ length: templateSlots.body }).map((_, i) => (
                                  <TextField
                                    key={`b-${i}`}
                                    size="small"
                                    fullWidth
                                    label={`Cuerpo {{${i + 1}}}`}
                                    value={message.bodyValues[i] ?? ''}
                                    onChange={(e) => {
                                      const next = [...message.bodyValues];
                                      next[i] = e.target.value;
                                      onMessageChange({ ...message, bodyValues: next });
                                    }}
                                  />
                                ))}
                              </Stack>
                            )}
                            {getComponentText(t.components, 'BODY') && (
                              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                Plantilla: {applyPlaceholdersToText(getComponentText(t.components, 'BODY') ?? '', message.bodyValues)}
                              </Typography>
                            )}
                          </Box>
                        </Collapse>
                      </Box>
                    );
                  })}
                </Box>
              ))
            )}
          </Box>
        )}
      </Box>

      <Box
        sx={{
          width: { xs: '100%', md: 300 },
          flexShrink: 0,
          p: 2,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
          position: { md: 'sticky' },
          top: 0,
          alignSelf: { md: 'flex-start' },
        }}
      >
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Vista previa
        </Typography>
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: 'action.hover',
            minHeight: 120,
          }}
        >
          <Box sx={bubbleSx}>
            <Typography variant="body2" component="div">
              {previewText}
            </Typography>
          </Box>
        </Box>
        {message.mode === 'template' && message.selectedTemplate && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {WHATSAPP_TEMPLATE_SECTIONS.find(
              (s) =>
                s.key ===
                resolveWhatsAppTemplatePanelSection(
                  message.selectedTemplate!.name,
                  message.selectedTemplate!.category,
                ),
            )?.description ?? 'Plantilla aprobada por Meta Business'}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default BulkSendMessageStep;
