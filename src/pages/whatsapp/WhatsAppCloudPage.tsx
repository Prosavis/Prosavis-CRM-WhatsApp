import React, { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminTour } from '@/context/AdminTourContext';
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Typography,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  InputAdornment,
  Alert,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Tooltip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormControlLabel,
  Radio,
  RadioGroup,
} from '@mui/material';
import {
  WhatsApp as WhatsAppIcon,
  Send as SendIcon,
  MarkEmailRead as ReadIcon,
  Error as ErrorIcon,
  Reply as ReplyIcon,
  Block as BlockIcon,
  Search as SearchIcon,
  FilterAltOff as FilterAltOffIcon,
  NavigateBefore as NavigateBeforeIcon,
  NavigateNext as NavigateNextIcon,
  DoneAll as DoneAllIcon,
  DeleteSweep as DeleteSweepIcon,
  Chat as ChatIcon,
  People as PeopleIcon,
  Hub as HubIcon,
} from '@mui/icons-material';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import WhatsAppLayout from '@/components/whatsapp/WhatsAppLayout';
import WhatsAppTopBar from '@/components/whatsapp/WhatsAppTopBar';
import { WHATSAPP_CLOUD_PRODUCTION } from '@/constants/whatsappCloudAccounts';
import useSoundEffects from '@/hooks/useSoundEffects';
import {
  bulkWhatsAppSend,
  listWhatsAppMessageTemplates,
  ensureWhatsAppConversationFromLead,
  fetchConversationPhoneNumbersForBulk,
  getWhatsAppMetrics,
  listWhatsAppMessageLog,
  purgeWhatsAppMessageLog,
  type WhatsAppTemplateSummary,
} from '@/services/whatsappService';
import { leadService } from '@/services/leadService';
import type { WhatsAppInboxMetrics } from '@/utils/whatsappInboxStats';

const LeadsPage = lazy(() => import('../leads/LeadsPage'));
const DiscountCodesTab = lazy(() => import('@/components/whatsapp/DiscountCodesTab'));
const WhatsAppSettingsTab = lazy(() => import('@/components/whatsapp/WhatsAppSettingsTab'));

interface MetricsData {
  period: { from: string; to: string };
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  reachedDevice: number;
  totalFailed: number;
  totalResponses: number;
  responseRate: number;
  optOutCount: number;
  byCampaign: Record<string, {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    outboundOk: number;
  }>;
  leads: {
    total: number;
    enSeguimiento: number;
    enRebooking: number;
    optOut: number;
    agendados: number;
  };
}

interface MessageLog {
  id: string;
  phoneNumberId?: string;
  recipientPhone?: string;
  recipientBsuid?: string;
  templateName?: string;
  messageBody?: string;
  status: string;
  direction?: string;
  intent?: string;
  createdAt: Date;
  waMessageId?: string;
  errorMessage?: string;
  campaignType?: string;
}

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  sent: 'info',
  delivered: 'success',
  read: 'success',
  failed: 'error',
  received: 'warning',
};

const KPI_CARDS = [
  { key: 'totalSent', label: 'Enviados (sin fallos)', icon: <SendIcon />, color: '#1976d2', bgLight: '#e3f2fd' },
  { key: 'reachedDevice', label: 'En el dispositivo (entreg. + leídos)', icon: <DoneAllIcon />, color: '#2e7d32', bgLight: '#e8f5e9' },
  { key: 'totalRead', label: 'Leídos', icon: <ReadIcon />, color: '#00897b', bgLight: '#e0f2f1' },
  { key: 'totalFailed', label: 'Fallidos', icon: <ErrorIcon />, color: '#d32f2f', bgLight: '#ffebee' },
  { key: 'totalResponses', label: 'Respuestas', icon: <ReplyIcon />, color: '#ed6c02', bgLight: '#fff3e0' },
  { key: 'optOutCount', label: 'Opt-out', icon: <BlockIcon />, color: '#78909c', bgLight: '#eceff1' },
] as const;

const ROWS_PER_PAGE = 15;

export const PURGE_WHATSAPP_LOG_CONFIRM_PHRASE = 'BORRAR_LOGS_WHATSAPP';

const { phoneNumberId, wabaId, phoneDisplay, botLabel } = WHATSAPP_CLOUD_PRODUCTION;

const WhatsAppCloudPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { playNavigation } = useSoundEffects();
  const { registerTabController, unregisterTabController } = useAdminTour();
  const tabParam = searchParams.get('tab');
  const activeTab = tabParam === 'metrics' ? 1 : tabParam === 'leads' ? 2 : tabParam === 'discounts' ? 3 : tabParam === 'settings' ? 4 : 0;

  const handleMainTabChange = (_: React.SyntheticEvent, value: number) => {
    playNavigation();
    const next = new URLSearchParams(searchParams);
    if (value === 0) next.delete('tab');
    else if (value === 1) next.set('tab', 'metrics');
    else if (value === 2) next.set('tab', 'leads');
    else if (value === 3) next.set('tab', 'discounts');
    else next.set('tab', 'settings');
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const tabLabels = ['', 'metrics', 'leads', 'discounts', 'settings'] as const;
    registerTabController('/whatsapp-cloud', {
      setTab: (index: number) => {
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            if (index === 0) next.delete('tab');
            else next.set('tab', tabLabels[index] || 'metrics');
            return next;
          },
          { replace: true },
        );
      },
      getTab: () => activeTab,
    });
    return () => unregisterTabController('/whatsapp-cloud');
  }, [registerTabController, unregisterTabController, activeTab, setSearchParams]);
  const [inboxTotalContacts, setInboxTotalContacts] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [days, setDays] = useState(30);
  const [logsFetchWarning, setLogsFetchWarning] = useState<string | null>(null);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeScope, setPurgeScope] = useState<'line' | 'all'>('line');
  const [purgeTypedPhrase, setPurgeTypedPhrase] = useState('');
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState(0);
  const [bulkRecipients, setBulkRecipients] = useState('');
  const [bulkMode, setBulkMode] = useState<'template' | 'text'>('template');
  const [bulkText, setBulkText] = useState('');
  const [bulkTemplates, setBulkTemplates] = useState<WhatsAppTemplateSummary[]>([]);
  const [bulkSelectedTemplate, setBulkSelectedTemplate] = useState('');
  const [bulkConfirmPhrase, setBulkConfirmPhrase] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkRecipientSource, setBulkRecipientSource] = useState<'manual' | 'system'>('manual');
  const [bulkImportLoading, setBulkImportLoading] = useState<'inbox' | 'leads' | 'union' | null>(null);
  const [bulkImportError, setBulkImportError] = useState<string | null>(null);

  const focusPhone = searchParams.get('focusPhone') || undefined;

  const handleOpenLeadInInbox = useCallback(async (phone: string, name?: string) => {
    try {
      await ensureWhatsAppConversationFromLead({
        phone,
        name,
        phoneNumberId,
      });
    } catch (err) {
      console.error('Error ensuring conversation:', err);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    next.set('focusPhone', phone);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleClearFocusPhone = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('focusPhone');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleInboxMetrics = useCallback((metrics: WhatsAppInboxMetrics) => {
    setInboxTotalContacts(metrics.totalConversations);
  }, []);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const data = await getWhatsAppMetrics(days, phoneNumberId);
      setMetrics(data as MetricsData);
    } catch (err: unknown) {
      setMetricsError(err instanceof Error ? err.message : 'Error cargando métricas');
    } finally {
      setMetricsLoading(false);
    }
  }, [days, phoneNumberId]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsFetchWarning(null);
    try {
      const rows = await listWhatsAppMessageLog({ days, phoneNumberId, limit: 500 });
      const mapped: MessageLog[] = rows.map((row) => ({
        id: row.id,
        phoneNumberId: row.phoneNumberId,
        recipientPhone: row.recipientPhone,
        recipientBsuid: row.recipientBsuid,
        templateName: row.templateName,
        messageBody: row.messageBody,
        status: row.status,
        direction: row.direction,
        intent: row.intent,
        createdAt: row.createdAt,
        waMessageId: row.waMessageId,
        campaignType: row.campaignType,
      }));
      setLogs(mapped);
    } catch (err: unknown) {
      console.error('Error cargando logs:', err);
      setLogs([]);
      setLogsFetchWarning(
        (err as Error)?.message || 'No se pudieron cargar los logs.',
      );
    } finally {
      setLogsLoading(false);
    }
  }, [days, phoneNumberId]);

  useEffect(() => {
    loadMetrics();
    loadLogs();
  }, [loadMetrics, loadLogs]);

  const filteredLogs = logs.filter((log) => {
    const matchSearch =
      !searchTerm ||
      log.recipientPhone?.includes(searchTerm) ||
      log.templateName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.messageBody?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' || log.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.ceil(filteredLogs.length / ROWS_PER_PAGE);
  const paginatedLogs = filteredLogs.slice(
    page * ROWS_PER_PAGE,
    page * ROWS_PER_PAGE + ROWS_PER_PAGE,
  );

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPage(0);
  };

  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'all';

  const handleOpenBulk = useCallback(async () => {
    setBulkOpen(true);
    setBulkStep(0);
    setBulkRecipients('');
    setBulkRecipientSource('manual');
    setBulkImportLoading(null);
    setBulkImportError(null);
    setBulkMode('template');
    setBulkText('');
    setBulkSelectedTemplate('');
    setBulkConfirmPhrase('');
    setBulkResult(null);
    setBulkError(null);
    if (wabaId) {
      try {
        const templates = await listWhatsAppMessageTemplates(wabaId);
        setBulkTemplates(templates.filter((t) => t.status === 'APPROVED'));
      } catch {
        setBulkTemplates([]);
      }
    }
  }, []);

  const parsedRecipients = useMemo(() => {
    return bulkRecipients
      .split(/[\n,;]+/)
      .map((line) => line.trim())
      .filter((line) => /\d{10,15}/.test(line.replace(/\D/g, '')))
      .map((line) => ({ phone: line.replace(/\D/g, '') }));
  }, [bulkRecipients]);

  const handleBulkLoadInbox = useCallback(async () => {
    setBulkImportLoading('inbox');
    setBulkImportError(null);
    try {
      const phones = await fetchConversationPhoneNumbersForBulk(phoneNumberId);
      setBulkRecipients(phones.join('\n'));
    } catch (e) {
      setBulkImportError((e as Error).message || 'No se pudieron cargar las conversaciones del Inbox');
    } finally {
      setBulkImportLoading(null);
    }
  }, []);

  const handleBulkLoadLeads = useCallback(async () => {
    setBulkImportLoading('leads');
    setBulkImportError(null);
    try {
      const phones = await leadService.fetchAllPhonesForBulk();
      setBulkRecipients(phones.join('\n'));
    } catch (e) {
      setBulkImportError((e as Error).message || 'No se pudieron cargar los leads');
    } finally {
      setBulkImportLoading(null);
    }
  }, []);

  const handleBulkLoadUnion = useCallback(async () => {
    setBulkImportLoading('union');
    setBulkImportError(null);
    try {
      const [inboxPhones, leadPhones] = await Promise.all([
        fetchConversationPhoneNumbersForBulk(phoneNumberId),
        leadService.fetchAllPhonesForBulk(),
      ]);
      setBulkRecipients([...new Set([...inboxPhones, ...leadPhones])].join('\n'));
    } catch (e) {
      setBulkImportError((e as Error).message || 'Error al combinar Inbox y leads');
    } finally {
      setBulkImportLoading(null);
    }
  }, []);

  const handleBulkSend = useCallback(async () => {
    setBulkLoading(true);
    setBulkError(null);
    try {
      const result = await bulkWhatsAppSend({
        recipients: parsedRecipients,
        ...(bulkMode === 'template' && bulkSelectedTemplate
          ? {
              templateName: bulkSelectedTemplate,
              templateLanguage: 'es_CO',
            }
          : {}),
        ...(bulkMode === 'text' ? { richBody: bulkText } : {}),
        phoneNumberId,
        confirmation: 'CONFIRMAR_ENVIO_MASIVO',
      });
      setBulkResult(result);
      setBulkStep(3);
    } catch (err: unknown) {
      setBulkError((err as Error)?.message || 'Error al enviar');
    } finally {
      setBulkLoading(false);
    }
  }, [parsedRecipients, bulkMode, bulkSelectedTemplate, bulkText]);

  type PageNumberItem = number | 'start-ellipsis' | 'end-ellipsis';

  const getPageNumbers = (): PageNumberItem[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
    const pages: PageNumberItem[] = [];
    if (page <= 3) {
      for (let i = 0; i < 5; i++) pages.push(i);
      pages.push('end-ellipsis', totalPages - 1);
    } else if (page >= totalPages - 4) {
      pages.push(0, 'start-ellipsis');
      for (let i = totalPages - 5; i < totalPages; i++) pages.push(i);
    } else {
      pages.push(0, 'start-ellipsis');
      for (let i = page - 1; i <= page + 1; i++) pages.push(i);
      pages.push('end-ellipsis', totalPages - 1);
    }
    return pages;
  };

  return (
    <>
      <WhatsAppTopBar
        activeTab={activeTab}
        onTabChange={handleMainTabChange}
        inboxTotalContacts={inboxTotalContacts}
        onOpenBulk={handleOpenBulk}
      />

      <Box sx={{ px: { xs: 0.5, sm: 0 } }}>
        <Box
          data-tour="whatsapp-tab-inbox"
          sx={{ display: activeTab === 0 ? 'block' : 'none' }}
        >
          <WhatsAppLayout
            phoneNumberId={phoneNumberId}
            wabaId={wabaId}
            focusPhone={focusPhone}
            onClearFocusPhone={handleClearFocusPhone}
            onInboxMetrics={handleInboxMetrics}
          />
        </Box>

      {activeTab === 1 && (
        <div data-tour="whatsapp-tab-metrics">
          <Box
            data-tour="whatsapp-metrics-toolbar"
            sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}
          >
            <Alert severity="info" icon={<WhatsAppIcon />} sx={{ flex: '1 1 220px', mr: { md: 2 } }}>
              Solo administradores
            </Alert>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Tooltip title="Borra documentos en Firestore (whatsapp_message_log). No modifica leads ni conversaciones.">
                <Button
                  variant="outlined"
                  color="warning"
                  size="small"
                  startIcon={<DeleteSweepIcon />}
                  onClick={() => {
                    setPurgeError(null);
                    setPurgeTypedPhrase('');
                    setPurgeScope('line');
                    setPurgeDialogOpen(true);
                  }}
                >
                  Limpiar registro
                </Button>
              </Tooltip>
              <FormControl size="small" sx={{ minWidth: 130 }}>
                <InputLabel>Periodo</InputLabel>
                <Select
                  value={days}
                  label="Periodo"
                  onChange={(e) => setDays(Number(e.target.value))}
                >
                  <MenuItem value={7}>7 días</MenuItem>
                  <MenuItem value={14}>14 días</MenuItem>
                  <MenuItem value={30}>30 días</MenuItem>
                  <MenuItem value={60}>60 días</MenuItem>
                  <MenuItem value={90}>90 días</MenuItem>
                </Select>
              </FormControl>
            </Stack>
          </Box>

          <Dialog
            open={purgeDialogOpen}
            onClose={() => !purgeLoading && setPurgeDialogOpen(false)}
            maxWidth="sm"
            fullWidth
          >
            <DialogTitle>Limpiar registro de mensajes</DialogTitle>
            <DialogContent>
              <DialogContentText component="div" sx={{ mb: 2 }}>
                Se eliminarán filas de la colección <strong>whatsapp_message_log</strong> en Firestore. Las métricas y la
                tabla de esta pestaña se basan en esos datos; al borrarlos, los contadores quedarán en cero (salvo leads,
                que no se tocan).
              </DialogContentText>
              <RadioGroup
                value={purgeScope}
                onChange={(e) => setPurgeScope(e.target.value as 'line' | 'all')}
              >
                <FormControlLabel
                  value="line"
                  control={<Radio disabled={purgeLoading} />}
                  label={`Solo línea actual: ${botLabel} (${phoneDisplay})`}
                />
                <FormControlLabel
                  value="all"
                  control={<Radio disabled={purgeLoading} />}
                  label="Todas las líneas (toda la colección de logs)"
                />
              </RadioGroup>
              <TextField
                autoFocus
                margin="dense"
                label="Confirmación"
                placeholder={PURGE_WHATSAPP_LOG_CONFIRM_PHRASE}
                fullWidth
                value={purgeTypedPhrase}
                onChange={(e) => setPurgeTypedPhrase(e.target.value)}
                disabled={purgeLoading}
                helperText={`Escribe exactamente: ${PURGE_WHATSAPP_LOG_CONFIRM_PHRASE}`}
                sx={{ mt: 2 }}
              />
              {purgeError && (
                <Alert severity="error" sx={{ mt: 2 }}>{purgeError}</Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPurgeDialogOpen(false)} disabled={purgeLoading}>
                Cancelar
              </Button>
              <Button
                color="error"
                variant="contained"
                disabled={
                  purgeLoading ||
                  purgeTypedPhrase.trim() !== PURGE_WHATSAPP_LOG_CONFIRM_PHRASE
                }
                onClick={async () => {
                  setPurgeLoading(true);
                  setPurgeError(null);
                  try {
                    await purgeWhatsAppMessageLog({
                      confirmation: purgeTypedPhrase.trim(),
                      phoneNumberId: purgeScope === 'line' ? phoneNumberId : undefined,
                      scope: purgeScope,
                    });
                    setPurgeDialogOpen(false);
                    setPurgeTypedPhrase('');
                    await loadMetrics();
                    await loadLogs();
                    setPage(0);
                  } catch (err: unknown) {
                    const msg =
                      (err as { message?: string })?.message ||
                      'No se pudo completar la limpieza';
                    setPurgeError(msg);
                  } finally {
                    setPurgeLoading(false);
                  }
                }}
              >
                {purgeLoading ? <CircularProgress size={22} color="inherit" /> : 'Eliminar definitivamente'}
              </Button>
            </DialogActions>
          </Dialog>

          {metricsError && (
            <Alert severity="error" sx={{ mb: 2 }}>{metricsError}</Alert>
          )}

          {/* KPIs */}
          <Grid container spacing={2} sx={{ mb: 3 }} data-tour="whatsapp-metrics-kpis">
            {KPI_CARDS.map(({ key, label, icon, color, bgLight }) => (
              <Grid item xs={6} sm={4} md={2} key={key}>
                <Card
                  elevation={0}
                  sx={{
                    height: '100%',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    transition: 'box-shadow 0.2s',
                    '&:hover': { boxShadow: 3 },
                  }}
                >
                  <CardContent sx={{ textAlign: 'center', py: 2.5, px: 1.5 }}>
                    <Box
                      sx={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        bgcolor: bgLight,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        mx: 'auto',
                        mb: 1,
                        color,
                      }}
                    >
                      {React.cloneElement(icon, { sx: { fontSize: 22 } })}
                    </Box>
                    {metricsLoading ? (
                      <CircularProgress size={22} sx={{ my: 0.5 }} />
                    ) : (
                      <Typography variant="h4" fontWeight={800} sx={{ color, lineHeight: 1.2 }}>
                        {(metrics?.[key as keyof MetricsData] as number ?? 0).toLocaleString('es-CO')}
                      </Typography>
                    )}
                    <Typography variant="body2" color="text.secondary" fontWeight={500} sx={{ mt: 0.5 }}>
                      {label}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Tasa de respuesta y Leads */}
          {metrics && (
            <Grid container spacing={2} sx={{ mb: 3 }} data-tour="whatsapp-metrics-funnel">
              <Grid item xs={12} md={4}>
                <Tooltip
                  title="Respuestas entrantes ÷ envíos sin fallo en el periodo. El porcentaje no supera 100%."
                  placement="top"
                  arrow
                >
                  <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%', cursor: 'help' }}>
                    <CardContent sx={{ textAlign: 'center', py: 3 }}>
                      <Typography variant="body2" color="text.secondary" fontWeight={500} gutterBottom>
                        Tasa de respuesta
                      </Typography>
                      <Typography variant="h3" fontWeight={800} color="primary">
                        {Math.min(100, metrics.responseRate)}%
                      </Typography>
                    </CardContent>
                  </Card>
                </Tooltip>
              </Grid>
              <Grid item xs={12} md={8}>
                <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, height: '100%' }}>
                  <CardContent>
                    <Typography variant="body2" color="text.secondary" fontWeight={500} gutterBottom>
                      Leads
                    </Typography>
                    <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                      <Chip label={`Total: ${metrics.leads.total}`} variant="outlined" />
                      <Chip label={`Seguimiento: ${metrics.leads.enSeguimiento}`} color="info" />
                      <Chip label={`Rebooking: ${metrics.leads.enRebooking}`} color="warning" />
                      <Chip label={`Agendados: ${metrics.leads.agendados}`} color="success" />
                      <Chip label={`Opt-out: ${metrics.leads.optOut}`} color="error" />
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          {/* Campañas */}
          {metrics && Object.keys(metrics.byCampaign).length > 0 && (
            <Card elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Por campaña
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Campaña</TableCell>
                        <TableCell align="right">Enviados (sin fallos)</TableCell>
                        <TableCell align="right">Entregados</TableCell>
                        <TableCell align="right">Leídos</TableCell>
                        <TableCell align="right">Fallidos</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(metrics.byCampaign).map(([name, data]) => {
                        const outboundOk =
                          data.outboundOk ?? data.sent + data.delivered + data.read;
                        return (
                          <TableRow key={name} hover>
                            <TableCell>{name}</TableCell>
                            <TableCell align="right">{outboundOk}</TableCell>
                            <TableCell align="right">{data.delivered}</TableCell>
                            <TableCell align="right">{data.read}</TableCell>
                            <TableCell align="right">{data.failed}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}

          {/* Logs de mensajes */}
          <Card data-tour="whatsapp-metrics-logs" elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
            <CardContent>
              {logsFetchWarning && (
                <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setLogsFetchWarning(null)}>
                  {logsFetchWarning}
                </Alert>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <Typography variant="subtitle1" fontWeight={600} sx={{ mr: 'auto' }}>
                  Registro de mensajes
                </Typography>
                <TextField
                  size="small"
                  placeholder="Buscar por teléfono, template..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start"><SearchIcon /></InputAdornment>
                    ),
                  }}
                  sx={{ minWidth: 250 }}
                />
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <InputLabel>Estado</InputLabel>
                  <Select
                    value={statusFilter}
                    label="Estado"
                    onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
                  >
                    <MenuItem value="all">Todos</MenuItem>
                    <MenuItem value="sent">Enviado</MenuItem>
                    <MenuItem value="delivered">Entregado</MenuItem>
                    <MenuItem value="read">Leído</MenuItem>
                    <MenuItem value="failed">Fallido</MenuItem>
                    <MenuItem value="received">Recibido</MenuItem>
                  </Select>
                </FormControl>
                {hasActiveFilters && (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<FilterAltOffIcon />}
                    onClick={clearFilters}
                  >
                    Limpiar filtros
                  </Button>
                )}
              </Box>

              {logsLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <>
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1.5 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow
                          sx={{
                            bgcolor: (t) =>
                              t.palette.mode === 'dark' ? 'action.hover' : 'grey.50',
                          }}
                        >
                          <TableCell sx={{ fontWeight: 600 }}>Fecha</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Destinatario</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Template / Tipo</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Estado</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Dirección</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Campaña</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Error</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {paginatedLogs.map((log) => (
                          <TableRow key={log.id} hover>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {log.createdAt.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                            </TableCell>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                              {log.recipientPhone || log.recipientBsuid || '—'}
                            </TableCell>
                            <TableCell>{log.templateName || '—'}</TableCell>
                            <TableCell>
                              <Chip
                                label={log.status}
                                size="small"
                                color={STATUS_COLORS[log.status] || 'default'}
                              />
                            </TableCell>
                            <TableCell>
                              {log.direction === 'inbound' ? (
                                <Chip label="Entrante" size="small" variant="outlined" color="warning" />
                              ) : (
                                <Chip label="Saliente" size="small" variant="outlined" color="info" />
                              )}
                            </TableCell>
                            <TableCell>{log.campaignType || '—'}</TableCell>
                            <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {log.errorMessage || '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                        {paginatedLogs.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                              <Typography color="text.secondary">
                                No se encontraron mensajes
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {/* Google-style centered pagination */}
                  {totalPages > 1 && (
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: 0.5,
                        mt: 3,
                        mb: 1,
                      }}
                    >
                      <IconButton
                        size="small"
                        disabled={page === 0}
                        onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
                        sx={{ color: 'primary.main' }}
                      >
                        <NavigateBeforeIcon />
                      </IconButton>

                      {getPageNumbers().map((p) =>
                        typeof p === 'string' ? (
                          <Typography
                            key={p}
                            sx={{ px: 1, color: 'text.secondary', userSelect: 'none' }}
                          >
                            …
                          </Typography>
                        ) : (
                          <Button
                            key={p}
                            size="small"
                            variant={p === page ? 'contained' : 'text'}
                            onClick={() => setPage(p)}
                            sx={{
                              minWidth: 36,
                              height: 36,
                              borderRadius: '50%',
                              fontWeight: p === page ? 700 : 400,
                              ...(p !== page && { color: 'primary.main' }),
                            }}
                          >
                            {p + 1}
                          </Button>
                        ),
                      )}

                      <IconButton
                        size="small"
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((currentPage) => Math.min(totalPages - 1, currentPage + 1))}
                        sx={{ color: 'primary.main' }}
                      >
                        <NavigateNextIcon />
                      </IconButton>
                    </Box>
                  )}

                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
                    {filteredLogs.length} registros · Página {page + 1} de {totalPages || 1}
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

        {activeTab === 2 && (
          <div data-tour="whatsapp-tab-leads">
            <Suspense
              fallback={
                <Box display="flex" justifyContent="center" alignItems="center" minHeight={240}>
                  <CircularProgress />
                </Box>
              }
            >
              <LeadsPage embedded onOpenInInbox={handleOpenLeadInInbox} />
            </Suspense>
          </div>
        )}

        {activeTab === 3 && (
          <div data-tour="whatsapp-tab-discounts">
            <Suspense
              fallback={
                <Box display="flex" justifyContent="center" alignItems="center" minHeight={240}>
                  <CircularProgress />
                </Box>
              }
            >
              <DiscountCodesTab />
            </Suspense>
          </div>
        )}

        {activeTab === 4 && (
          <div data-tour="whatsapp-tab-settings">
            <Suspense
              fallback={
                <Box display="flex" justifyContent="center" alignItems="center" minHeight={240}>
                  <CircularProgress />
                </Box>
              }
            >
              <WhatsAppSettingsTab phoneNumberId={phoneNumberId} />
            </Suspense>
          </div>
        )}
      </Box>

      <Dialog open={bulkOpen} onClose={() => !bulkLoading && setBulkOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Envío masivo WhatsApp</DialogTitle>
        <DialogContent>
          <Stepper activeStep={bulkStep} sx={{ mb: 3, mt: 1 }}>
            <Step><StepLabel>Destinatarios</StepLabel></Step>
            <Step><StepLabel>Mensaje</StepLabel></Step>
            <Step><StepLabel>Confirmar</StepLabel></Step>
            <Step><StepLabel>Resultado</StepLabel></Step>
          </Stepper>

          {bulkStep === 0 && (
            <Box>
              <RadioGroup
                row
                value={bulkRecipientSource}
                onChange={(e) => {
                  setBulkRecipientSource(e.target.value as 'manual' | 'system');
                  setBulkImportError(null);
                }}
                sx={{ mb: 2 }}
              >
                <FormControlLabel value="manual" control={<Radio />} label="Pegar o escribir" />
                <FormControlLabel value="system" control={<Radio />} label="Cargar desde el sistema" />
              </RadioGroup>

              {bulkRecipientSource === 'system' && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Importa números del Inbox de WhatsApp (esta línea), de todos los leads con teléfono, o la unión de
                    ambos sin duplicados. El resultado rellena el cuadro de abajo; puedes editarlo antes de continuar.
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap">
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={
                        bulkImportLoading === 'inbox' ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <ChatIcon />
                        )
                      }
                      disabled={bulkImportLoading !== null}
                      onClick={handleBulkLoadInbox}
                      sx={{ textTransform: 'none' }}
                    >
                      Inbox WhatsApp
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={
                        bulkImportLoading === 'leads' ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <PeopleIcon />
                        )
                      }
                      disabled={bulkImportLoading !== null}
                      onClick={handleBulkLoadLeads}
                      sx={{ textTransform: 'none' }}
                    >
                      Leads (teléfono)
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={
                        bulkImportLoading === 'union' ? (
                          <CircularProgress size={16} color="inherit" />
                        ) : (
                          <HubIcon />
                        )
                      }
                      disabled={bulkImportLoading !== null}
                      onClick={handleBulkLoadUnion}
                      sx={{ textTransform: 'none' }}
                    >
                      Inbox + leads (únicos)
                    </Button>
                  </Stack>
                  {bulkImportError && (
                    <Alert severity="error" sx={{ mt: 1.5 }}>
                      {bulkImportError}
                    </Alert>
                  )}
                </Box>
              )}

              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {bulkRecipientSource === 'manual'
                  ? 'Pega los números (uno por línea o separados por coma). Formato: 573001234567'
                  : 'Lista de destinatarios (puedes pegar, importar con los botones o combinar ambos).'}
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={8}
                placeholder={'573001234567\n573009876543\n...'}
                value={bulkRecipients}
                onChange={(e) => setBulkRecipients(e.target.value)}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {parsedRecipients.length} números válidos detectados
              </Typography>
            </Box>
          )}

          {bulkStep === 1 && (
            <Box>
              <RadioGroup
                row
                value={bulkMode}
                onChange={(e) => setBulkMode(e.target.value as 'template' | 'text')}
                sx={{ mb: 2 }}
              >
                <FormControlLabel value="template" control={<Radio />} label="Plantilla Meta" />
                <FormControlLabel value="text" control={<Radio />} label="Texto libre" />
              </RadioGroup>
              {bulkMode === 'template' ? (
                <FormControl fullWidth>
                  <InputLabel>Plantilla</InputLabel>
                  <Select
                    value={bulkSelectedTemplate}
                    label="Plantilla"
                    onChange={(e) => setBulkSelectedTemplate(e.target.value)}
                  >
                    {bulkTemplates.map((t) => (
                      <MenuItem key={`${t.name}-${t.language}`} value={t.name}>
                        {t.name} ({t.language})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              ) : (
                <TextField
                  fullWidth
                  multiline
                  rows={5}
                  placeholder="Escribe el mensaje que recibirán todos los destinatarios..."
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                />
              )}
            </Box>
          )}

          {bulkStep === 2 && (
            <Box>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Estás a punto de enviar un mensaje a <strong>{parsedRecipients.length}</strong> destinatarios.
                {bulkMode === 'template'
                  ? ` Plantilla: ${bulkSelectedTemplate}`
                  : ` Texto libre (${bulkText.length} caracteres)`}
              </Alert>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Línea: {botLabel} ({phoneDisplay})
              </Typography>
              <TextField
                fullWidth
                label="Confirmación"
                placeholder="CONFIRMAR_ENVIO_MASIVO"
                value={bulkConfirmPhrase}
                onChange={(e) => setBulkConfirmPhrase(e.target.value)}
                helperText="Escribe: CONFIRMAR_ENVIO_MASIVO"
              />
              {bulkError && <Alert severity="error" sx={{ mt: 2 }}>{bulkError}</Alert>}
            </Box>
          )}

          {bulkStep === 3 && bulkResult && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography variant="h5" fontWeight={700} color="success.main" gutterBottom>
                Envío completado
              </Typography>
              <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 2 }}>
                <Chip label={`Enviados: ${bulkResult.sent}`} color="success" />
                <Chip label={`Fallidos: ${bulkResult.failed}`} color="error" />
                <Chip label={`Omitidos: ${bulkResult.skipped}`} color="default" />
              </Stack>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkOpen(false)} disabled={bulkLoading}>
            {bulkStep === 3 ? 'Cerrar' : 'Cancelar'}
          </Button>
          {bulkStep > 0 && bulkStep < 3 && (
            <Button onClick={() => setBulkStep((s) => s - 1)} disabled={bulkLoading}>
              Atrás
            </Button>
          )}
          {bulkStep < 2 && (
            <Button
              variant="contained"
              onClick={() => setBulkStep((s) => s + 1)}
              disabled={
                (bulkStep === 0 && parsedRecipients.length === 0) ||
                (bulkStep === 1 && bulkMode === 'template' && !bulkSelectedTemplate) ||
                (bulkStep === 1 && bulkMode === 'text' && !bulkText.trim())
              }
            >
              Siguiente
            </Button>
          )}
          {bulkStep === 2 && (
            <Button
              variant="contained"
              color="warning"
              onClick={handleBulkSend}
              disabled={bulkLoading || bulkConfirmPhrase !== 'CONFIRMAR_ENVIO_MASIVO'}
            >
              {bulkLoading ? <CircularProgress size={22} color="inherit" /> : 'Enviar a todos'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default WhatsAppCloudPage;
