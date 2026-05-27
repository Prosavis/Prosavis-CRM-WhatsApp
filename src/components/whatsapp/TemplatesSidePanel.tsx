import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  listWhatsAppMessageTemplates,
  sendWhatsAppTemplateMessageAdmin,
  type WhatsAppTemplateSummary,
} from '@/services/whatsappService';
import {
  WHATSAPP_TEMPLATE_SECTIONS,
  getWhatsAppTemplateSectionOrder,
  resolveWhatsAppTemplatePanelSection,
  type WhatsAppTemplatePanelSection,
} from '@/constants/whatsappTemplateSections';
import {
  buildDisplayMessageBody,
  buildTemplateSendComponents,
  countSlotsForTemplate,
  getExampleValues,
  previewTextForList,
} from '@/utils/whatsappTemplateHelpers';

type TemplateCategoryKey = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | 'UNKNOWN';

function resolveTemplateCategory(raw: string | undefined): TemplateCategoryKey {
  const u = (raw || '').toUpperCase().trim();
  if (u === 'UTILITY' || u === 'MARKETING' || u === 'AUTHENTICATION') return u;
  return 'UNKNOWN';
}

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

function TemplateCategoryChip({ category }: { category?: string }) {
  const key = resolveTemplateCategory(category);
  const specs: Record<
    TemplateCategoryKey,
    { label: string; tooltip: string; sx: Record<string, string | number> }
  > = {
    UTILITY: {
      label: 'Utilidad',
      tooltip:
        'Conversaciones de servicio al cliente o actualizaciones sobre un pedido o cuenta. Suele tener costo distinto al de marketing.',
      sx: {
        bgcolor: '#e8f5e9',
        color: '#1b5e20',
        fontWeight: 600,
        border: '1px solid #a5d6a7',
      },
    },
    MARKETING: {
      label: 'Marketing',
      tooltip:
        'Promociones, ofertas o mensajes proactivos. Meta cobra estas conversaciones con tarifa de marketing.',
      sx: {
        bgcolor: '#fff3e0',
        color: '#e65100',
        fontWeight: 600,
        border: '1px solid #ffcc80',
      },
    },
    AUTHENTICATION: {
      label: 'Autenticación',
      tooltip:
        'Códigos de un solo uso o verificación (p. ej. OTP). Reglas y costos específicos de Meta.',
      sx: {
        bgcolor: '#e3f2fd',
        color: '#0d47a1',
        fontWeight: 600,
        border: '1px solid #90caf9',
      },
    },
    UNKNOWN: {
      label: 'Sin categoría',
      tooltip: 'Meta no devolvió categoría en la API; revisa en el administrador de Meta.',
      sx: {
        bgcolor: '#f5f5f5',
        color: '#616161',
        fontWeight: 600,
        border: '1px solid #e0e0e0',
      },
    },
  };
  const s = specs[key];
  return (
    <Tooltip title={s.tooltip} arrow placement="top">
      <Chip label={s.label} size="small" sx={{ height: 22, fontSize: '0.7rem', ...s.sx }} />
    </Tooltip>
  );
}

interface TemplatesSidePanelProps {
  wabaId: string;
  phoneNumberId: string;
  recipientPhone: string;
  onApplyDraftToComposer?: (text: string) => void;
}

const BUBBLE_PREVIEW_SX = {
  maxWidth: '100%',
  bgcolor: '#d9fdd3',
  borderRadius: 2,
  px: 1.5,
  py: 0.75,
  boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
} as const;

const TemplatesSidePanel: React.FC<TemplatesSidePanelProps> = ({
  wabaId,
  phoneNumberId,
  recipientPhone,
  onApplyDraftToComposer,
}) => {
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WhatsAppTemplateSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [headerValues, setHeaderValues] = useState<string[]>([]);
  const [bodyValues, setBodyValues] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const filteredTemplates = useMemo(() => {
    const approved = templates.filter((t) => t.status === 'APPROVED');
    const esCo = approved.filter((t) => t.language === 'es_CO');
    const esAny = approved.filter((t) => typeof t.language === 'string' && t.language.startsWith('es'));
    const base = esCo.length ? esCo : esAny.length ? esAny : approved;
    return [...base].sort((a, b) => {
      const sa = resolveWhatsAppTemplatePanelSection(a.name, a.category);
      const sb = resolveWhatsAppTemplatePanelSection(b.name, b.category);
      const sectionOrderDiff = getWhatsAppTemplateSectionOrder(sa) - getWhatsAppTemplateSectionOrder(sb);
      if (sectionOrderDiff !== 0) return sectionOrderDiff;
      const ca = categorySortOrder(resolveTemplateCategory(a.category));
      const cb = categorySortOrder(resolveTemplateCategory(b.category));
      if (ca !== cb) return ca - cb;
      return a.name.localeCompare(b.name, 'es');
    });
  }, [templates]);

  const templatesBySection = useMemo(() => {
    const grouped = new Map<WhatsAppTemplatePanelSection, WhatsAppTemplateSummary[]>();
    for (const template of filteredTemplates) {
      const section = resolveWhatsAppTemplatePanelSection(template.name, template.category);
      const list = grouped.get(section) || [];
      list.push(template);
      grouped.set(section, list);
    }
    return WHATSAPP_TEMPLATE_SECTIONS.map((section) => ({
      section,
      templates: grouped.get(section.key) || [],
    })).filter((item) => item.templates.length > 0);
  }, [filteredTemplates]);

  const expandedTemplate = useMemo(() => {
    if (!expandedId) return null;
    return filteredTemplates.find((t) => `${t.name}:${t.language}` === expandedId) ?? null;
  }, [expandedId, filteredTemplates]);

  const slots = useMemo(
    () => (expandedTemplate ? countSlotsForTemplate(expandedTemplate) : { header: 0, body: 0 }),
    [expandedTemplate],
  );

  const headerExamples = useMemo(
    () => (expandedTemplate ? getExampleValues(expandedTemplate.components, 'HEADER') : []),
    [expandedTemplate],
  );
  const bodyExamples = useMemo(
    () => (expandedTemplate ? getExampleValues(expandedTemplate.components, 'BODY') : []),
    [expandedTemplate],
  );

  useEffect(() => {
    if (!expandedTemplate) return;
    const { header, body } = countSlotsForTemplate(expandedTemplate);
    setHeaderValues(Array.from({ length: header }, () => ''));
    setBodyValues(Array.from({ length: body }, () => ''));
    setSendError(null);
  }, [expandedTemplate]);

  const loadTemplates = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const list = await listWhatsAppMessageTemplates(wabaId);
      setTemplates(list);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudieron cargar las plantillas';
      setListError(msg);
    } finally {
      setLoadingList(false);
    }
  }, [wabaId]);

  useEffect(() => {
    if (wabaId) void loadTemplates();
  }, [wabaId, loadTemplates]);

  const toggleExpand = (t: WhatsAppTemplateSummary) => {
    const id = `${t.name}:${t.language}`;
    setExpandedId((prev) => (prev === id ? null : id));
    setSendError(null);
  };

  const handleSend = async () => {
    if (!expandedTemplate) return;
    setSendError(null);
    const { header, body } = countSlotsForTemplate(expandedTemplate);
    if (header > 0 && headerValues.some((v) => !v.trim())) {
      setSendError('Completa todos los parámetros del encabezado');
      return;
    }
    if (body > 0 && bodyValues.some((v) => !v.trim())) {
      setSendError('Completa todos los parámetros del cuerpo');
      return;
    }

    const components = buildTemplateSendComponents(expandedTemplate, headerValues, bodyValues);

    const displayMessageBody = buildDisplayMessageBody(
      expandedTemplate,
      headerValues,
      bodyValues,
    );

    setSending(true);
    try {
      await sendWhatsAppTemplateMessageAdmin({
        recipientPhone,
        templateName: expandedTemplate.name,
        templateLanguage: expandedTemplate.language,
        components: components.length > 0 ? components : undefined,
        phoneNumberId,
        displayMessageBody,
      });
      setExpandedId(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al enviar';
      setSendError(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <Box
      sx={{
        width: 340,
        minWidth: 280,
        maxWidth: 360,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: 1,
        borderColor: 'divider',
        bgcolor: 'background.default',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Typography variant="subtitle2" fontWeight={600}>
          Plantillas
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" noWrap title={recipientPhone}>
          A: {recipientPhone}
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {listError && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setListError(null)}>
            {listError}
          </Alert>
        )}

        {loadingList ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : filteredTemplates.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
            No hay plantillas aprobadas en español.
          </Typography>
        ) : (
          templatesBySection.map(({ section, templates: sectionTemplates }) => (
            <Box key={section.key} sx={{ mb: 2 }}>
              <Box sx={{ px: 0.5, mb: 1 }}>
                <Typography variant="caption" fontWeight={700} color="text.primary">
                  {section.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {section.description}
                </Typography>
              </Box>

              {sectionTemplates.map((t) => {
                const id = `${t.name}:${t.language}`;
                const isOpen = expandedId === id;
                return (
                  <Box key={id} sx={{ mb: 1.5 }}>
                    <Box
                      onClick={() => toggleExpand(t)}
                      sx={{
                        cursor: 'pointer',
                        borderRadius: 1,
                        p: 1,
                        bgcolor: isOpen ? 'action.selected' : 'background.paper',
                        border: 1,
                        borderColor: 'divider',
                        '&:hover': { bgcolor: isOpen ? 'action.selected' : 'action.hover' },
                      }}
                    >
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75 }}>
                        <Typography
                          variant="caption"
                          fontWeight={600}
                          color="text.primary"
                          sx={{ lineHeight: 1.3 }}
                        >
                          {t.name}
                        </Typography>
                        <TemplateCategoryChip category={t.category} />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.75 }}>
                        <Box sx={BUBBLE_PREVIEW_SX}>
                          <Typography
                            variant="body2"
                            sx={{
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              color: '#111b21',
                              lineHeight: 1.4,
                              fontSize: '0.8125rem',
                            }}
                          >
                            {previewTextForList(t)}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>

                    <Collapse in={isOpen}>
                      <Box sx={{ pt: 1.5, px: 0.5 }}>
                        {sendError && (
                          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setSendError(null)}>
                            {sendError}
                          </Alert>
                        )}

                        {slots.header > 0 && (
                          <Box sx={{ mb: 1.5 }}>
                            <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
                              Encabezado
                            </Typography>
                            {Array.from({ length: slots.header }).map((_, i) => (
                              <TextField
                                key={`h-${i}`}
                                fullWidth
                                size="small"
                                sx={{ mb: 1 }}
                                label={`Variable {{${i + 1}}}`}
                                helperText={headerExamples[i] ? `Ej: ${headerExamples[i]}` : undefined}
                                placeholder={headerExamples[i] || ''}
                                value={headerValues[i] || ''}
                                onChange={(e) => {
                                  const next = [...headerValues];
                                  next[i] = e.target.value;
                                  setHeaderValues(next);
                                }}
                              />
                            ))}
                          </Box>
                        )}

                        {slots.body > 0 && (
                          <Box sx={{ mb: 1.5 }}>
                            <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
                              Cuerpo
                            </Typography>
                            {Array.from({ length: slots.body }).map((_, i) => (
                              <TextField
                                key={`b-${i}`}
                                fullWidth
                                size="small"
                                sx={{ mb: 1 }}
                                label={`Variable {{${i + 1}}}`}
                                helperText={bodyExamples[i] ? `Ej: ${bodyExamples[i]}` : undefined}
                                placeholder={bodyExamples[i] || ''}
                                value={bodyValues[i] || ''}
                                onChange={(e) => {
                                  const next = [...bodyValues];
                                  next[i] = e.target.value;
                                  setBodyValues(next);
                                }}
                              />
                            ))}
                          </Box>
                        )}

                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            fullWidth
                            variant="contained"
                            size="small"
                            disabled={sending}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleSend();
                            }}
                          >
                            {sending ? <CircularProgress size={20} color="inherit" /> : 'Enviar plantilla'}
                          </Button>
                          {onApplyDraftToComposer && (
                            <Button
                              fullWidth
                              variant="outlined"
                              size="small"
                              disabled={sending}
                              onClick={(e) => {
                                e.stopPropagation();
                                const display = expandedTemplate
                                  ? buildDisplayMessageBody(expandedTemplate, headerValues, bodyValues)
                                  : '';
                                const cleanText = display.replace(/^\[Plantilla:.*?\]\n/, '');
                                onApplyDraftToComposer(cleanText);
                              }}
                            >
                              Cargar en editor
                            </Button>
                          )}
                        </Box>
                      </Box>
                    </Collapse>
                    <Divider sx={{ mt: 1 }} />
                  </Box>
                );
              })}
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
};

export default TemplatesSidePanel;
