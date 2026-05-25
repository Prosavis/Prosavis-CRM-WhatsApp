import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import {
  listWhatsAppMessageTemplates,
  sendWhatsAppTemplateMessageAdmin,
  listWhatsAppIATemplates,
  createWhatsAppIATemplate,
  generateWhatsAppIATemplate,
  deleteWhatsAppIATemplate,
  resolveWhatsAppIATemplate,
  sendWhatsAppQuickReply,
  type WhatsAppTemplateSummary,
  type IATemplateSummary,
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

  const [activeTab, setActiveTab] = useState(0);

  // IA templates state
  const [iaTemplates, setIaTemplates] = useState<IATemplateSummary[]>([]);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaExpandedId, setIaExpandedId] = useState<string | null>(null);
  const [iaResolvedBody, setIaResolvedBody] = useState<string | null>(null);
  const [iaResolving, setIaResolving] = useState(false);
  const [iaSending, setIaSending] = useState(false);
  const [iaCustomValues, setIaCustomValues] = useState<Record<string, string>>({});
  const [iaUnresolved, setIaUnresolved] = useState<string[]>([]);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createLabel, setCreateLabel] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createBody, setCreateBody] = useState('');
  const [creating, setCreating] = useState(false);

  // Generate dialog
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generatePrompt, setGeneratePrompt] = useState('');
  const [generating, setGenerating] = useState(false);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<IATemplateSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  // --- IA templates ---

  const loadIATemplates = useCallback(async () => {
    setIaLoading(true);
    try {
      const list = await listWhatsAppIATemplates();
      setIaTemplates(list);
    } catch {
      setIaTemplates([]);
    } finally {
      setIaLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIATemplates();
  }, [loadIATemplates]);

  const handleIaExpand = async (t: IATemplateSummary) => {
    if (iaExpandedId === t.id) {
      setIaExpandedId(null);
      setIaResolvedBody(null);
      setIaUnresolved([]);
      setIaCustomValues({});
      return;
    }
    setIaExpandedId(t.id);
    setIaResolvedBody(null);
    setIaUnresolved([]);
    setIaCustomValues({});
    setIaResolving(true);
    try {
      const result = await resolveWhatsAppIATemplate({
        templateId: t.id,
        recipientPhone,
      });
      setIaResolvedBody(result.body);
      setIaUnresolved(result.unresolvedVariables);
    } catch {
      setIaResolvedBody(t.body);
      setIaUnresolved(t.variables);
    } finally {
      setIaResolving(false);
    }
  };

  const handleResolveWithCustom = async (templateId: string) => {
    setIaResolving(true);
    try {
      const result = await resolveWhatsAppIATemplate({
        templateId,
        recipientPhone,
        customValues: iaCustomValues,
      });
      setIaResolvedBody(result.body);
      setIaUnresolved(result.unresolvedVariables);
    } catch {
      // keep current
    } finally {
      setIaResolving(false);
    }
  };

  const handleIaSend = async (templateId: string) => {
    if (!iaResolvedBody) return;
    setIaSending(true);
    setSendError(null);
    try {
      await sendWhatsAppQuickReply({
        recipientPhone,
        body: iaResolvedBody,
        templateId,
        phoneNumberId,
      });
      setIaExpandedId(null);
      setIaResolvedBody(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al enviar';
      setSendError(msg);
    } finally {
      setIaSending(false);
    }
  };

  const handleCreate = async () => {
    if (!createLabel.trim() || !createBody.trim()) return;
    setCreating(true);
    try {
      await createWhatsAppIATemplate({
        label: createLabel.trim(),
        description: createDesc.trim() || createLabel.trim(),
        body: createBody.trim(),
      });
      setCreateOpen(false);
      setCreateLabel('');
      setCreateDesc('');
      setCreateBody('');
      void loadIATemplates();
    } catch {
      // silently fail
    } finally {
      setCreating(false);
    }
  };

  const handleGenerate = async () => {
    if (!generatePrompt.trim()) return;
    setGenerating(true);
    try {
      await generateWhatsAppIATemplate(generatePrompt.trim());
      setGenerateOpen(false);
      setGeneratePrompt('');
      void loadIATemplates();
    } catch {
      // silently fail
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteWhatsAppIATemplate(deleteTarget.id);
      setDeleteTarget(null);
      if (iaExpandedId === deleteTarget.id) {
        setIaExpandedId(null);
        setIaResolvedBody(null);
      }
      void loadIATemplates();
    } catch {
      // silently fail
    } finally {
      setDeleting(false);
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
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="fullWidth"
          sx={{ mt: 1, minHeight: 32, '& .MuiTab-root': { minHeight: 32, py: 0.5, fontSize: '0.75rem' } }}
        >
          <Tab label="Meta" />
          <Tab label="IA" />
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
        {/* === TAB META === */}
        {activeTab === 0 && (
          <>
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
          </>
        )}

        {/* === TAB IA === */}
        {activeTab === 1 && (
          <Box>
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setCreateOpen(true)}
                sx={{ flex: 1, fontSize: '0.7rem' }}
              >
                Crear plantilla
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<AutoAwesomeIcon />}
                onClick={() => setGenerateOpen(true)}
                sx={{ flex: 1, fontSize: '0.7rem' }}
                color="secondary"
              >
                Generar con IA
              </Button>
            </Box>

            {iaLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : iaTemplates.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 2 }}>
                No hay plantillas IA. Crea una nueva o genera con inteligencia artificial.
              </Typography>
            ) : (
              iaTemplates.map((t) => {
                const isOpen = iaExpandedId === t.id;
                return (
                  <Box key={t.id} sx={{ mb: 1.5 }}>
                    <Box
                      onClick={() => void handleIaExpand(t)}
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
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" fontWeight={600} color="text.primary" sx={{ flex: 1 }}>
                          {t.label}
                        </Typography>
                        {t.generatedByAI && (
                          <Chip
                            label="IA"
                            size="small"
                            sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#ede7f6', color: '#4527a0' }}
                          />
                        )}
                        {t.isDefault && (
                          <Chip
                            label="Default"
                            size="small"
                            sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#e8f5e9', color: '#2e7d32' }}
                          />
                        )}
                        <IconButton
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(t);
                          }}
                          sx={{ p: 0.25 }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        </IconButton>
                      </Box>
                      <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.25 }}>
                        {t.description}
                      </Typography>
                      {t.variables.length > 0 && (
                        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                          {t.variables.map((v) => (
                            <Chip
                              key={v}
                              label={`{{${v}}}`}
                              size="small"
                              variant="outlined"
                              sx={{ height: 18, fontSize: '0.6rem' }}
                            />
                          ))}
                        </Box>
                      )}
                    </Box>

                    <Collapse in={isOpen}>
                      <Box sx={{ pt: 1.5, px: 0.5 }}>
                        {iaResolving ? (
                          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                            <CircularProgress size={24} />
                          </Box>
                        ) : iaResolvedBody !== null ? (
                          <>
                            {iaUnresolved.length > 0 && (
                              <Box sx={{ mb: 1.5 }}>
                                <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
                                  Variables pendientes
                                </Typography>
                                {iaUnresolved.map((v) => (
                                  <TextField
                                    key={v}
                                    fullWidth
                                    size="small"
                                    sx={{ mb: 1 }}
                                    label={`{{${v}}}`}
                                    value={iaCustomValues[v] || ''}
                                    onChange={(e) =>
                                      setIaCustomValues((prev) => ({ ...prev, [v]: e.target.value }))
                                    }
                                  />
                                ))}
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={() => void handleResolveWithCustom(t.id)}
                                  disabled={iaResolving}
                                >
                                  Aplicar valores
                                </Button>
                              </Box>
                            )}
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
                                {iaResolvedBody}
                              </Typography>
                            </Box>
                            {sendError && (
                              <Alert severity="error" sx={{ mt: 1 }} onClose={() => setSendError(null)}>
                                {sendError}
                              </Alert>
                            )}
                            <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                              <Button
                                fullWidth
                                variant="contained"
                                size="small"
                                disabled={iaSending}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleIaSend(t.id);
                                }}
                              >
                                {iaSending ? <CircularProgress size={20} color="inherit" /> : 'Enviar'}
                              </Button>
                              {onApplyDraftToComposer && (
                                <Button
                                  fullWidth
                                  variant="outlined"
                                  size="small"
                                  disabled={iaSending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onApplyDraftToComposer(iaResolvedBody || '');
                                  }}
                                >
                                  Cargar en editor
                                </Button>
                              )}
                            </Box>
                          </>
                        ) : null}
                      </Box>
                    </Collapse>
                    <Divider sx={{ mt: 1 }} />
                  </Box>
                );
              })
            )}
          </Box>
        )}
      </Box>

      {/* Dialog: Crear plantilla IA */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Crear plantilla IA</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            size="small"
            label="Nombre"
            value={createLabel}
            onChange={(e) => setCreateLabel(e.target.value)}
            sx={{ mt: 1, mb: 1.5 }}
          />
          <TextField
            fullWidth
            size="small"
            label="Descripción (opcional)"
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
            sx={{ mb: 1.5 }}
          />
          <TextField
            fullWidth
            multiline
            minRows={4}
            size="small"
            label="Cuerpo del mensaje"
            value={createBody}
            onChange={(e) => setCreateBody(e.target.value)}
            helperText='Usa {{nombre}} para el nombre del contacto. Puedes crear variables con {{mi_variable}}.'
            sx={{ mb: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating || !createLabel.trim() || !createBody.trim()}
          >
            {creating ? <CircularProgress size={20} color="inherit" /> : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Generar con IA */}
      <Dialog open={generateOpen} onClose={() => setGenerateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Generar plantilla con IA</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Describe qué tipo de plantilla necesitas y la IA la generará automáticamente.
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={3}
            size="small"
            label="¿Qué plantilla necesitas?"
            placeholder="Ej: Un mensaje para invitar clientes a probar nuestro servicio de limpieza profunda con 20% de descuento"
            value={generatePrompt}
            onChange={(e) => setGeneratePrompt(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGenerateOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleGenerate}
            disabled={generating || !generatePrompt.trim()}
            startIcon={generating ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
          >
            {generating ? 'Generando...' : 'Generar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Confirmar eliminación */}
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Eliminar plantilla</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            ¿Eliminar la plantilla &quot;{deleteTarget?.label}&quot;? Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancelar</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? <CircularProgress size={20} color="inherit" /> : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TemplatesSidePanel;
