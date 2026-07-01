import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
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
} from '@mui/icons-material';
import WhatsAppLayout from '@/components/whatsapp/WhatsAppLayout';
import WhatsAppTopBar from '@/components/whatsapp/WhatsAppTopBar';
import WhatsAppDirectoryContactsDialog from '@/components/whatsapp/WhatsAppDirectoryContactsDialog';
import WhatsAppBulkSendDialog from '@/components/whatsapp/bulk/WhatsAppBulkSendDialog';
import BroadcastJobsSection from '@/components/whatsapp/metrics/BroadcastJobsSection';
import { WHATSAPP_CLOUD_PRODUCTION } from '@/constants/whatsappCloudAccounts';
import useSoundEffects from '@/hooks/useSoundEffects';
import {
  ensureWhatsAppConversationFromLead,
  getWhatsAppMetrics,
  listWhatsAppMessageLog,
  purgeWhatsAppMessageLog,
} from '@/services/whatsappService';
import { directoryService } from '@/services/directoryService';
import type { WhatsAppInboxMetrics } from '@/utils/whatsappInboxStats';
import {
  WHATSAPP_FOCUS_CHAT_EVENT,
  dismissDesktopNotificationsOnboarding,
  getNotificationPermission,
  isDesktopNotificationsOnboardingDismissed,
  isNotificationSupported,
  type WhatsAppFocusChatDetail,
} from '@/utils/desktopNotifications';

const LeadsPage = lazy(() => import('../leads/LeadsPage'));
const DiscountCodesTab = lazy(() => import('@/components/whatsapp/DiscountCodesTab'));
const WhatsAppSettingsTab = lazy(() => import('@/components/whatsapp/WhatsAppSettingsTab'));
const MonitorTab = lazy(() => import('@/components/whatsapp/MonitorTab'));
const AutomationsPage = lazy(() => import('@/pages/automations/AutomationsPage'));

interface OutboundBucket {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  outboundOk: number;
  total?: number;
}

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
  uniqueContactsMessaged?: number;
  uniqueContactsResponded?: number;
  byCampaign: Record<string, OutboundBucket>;
  byTemplate?: Record<string, OutboundBucket>;
  byKind?: {
    session: OutboundBucket;
    template: OutboundBucket;
  };
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
  const broadcastJobParam = searchParams.get('broadcastJob');
  const activeTab =
    tabParam === 'metrics'
      ? 1
      : tabParam === 'leads'
        ? 2
        : tabParam === 'discounts'
          ? 3
          : tabParam === 'settings'
            ? 4
            : tabParam === 'monitoreo'
              ? 5
              : tabParam === 'automations'
                ? 6
                : 0;

  const clearBroadcastJobParam = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('broadcastJob');
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const handleMainTabChange = (_: React.SyntheticEvent, value: number) => {
    playNavigation();
    const next = new URLSearchParams(searchParams);
    if (value === 0) next.delete('tab');
    else if (value === 1) next.set('tab', 'metrics');
    else if (value === 2) next.set('tab', 'leads');
    else if (value === 3) next.set('tab', 'discounts');
    else if (value === 4) next.set('tab', 'settings');
    else if (value === 5) next.set('tab', 'monitoreo');
    else next.set('tab', 'automations');
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    const tabLabels = ['', 'metrics', 'leads', 'discounts', 'settings', 'monitoreo', 'automations'] as const;
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
  const [directoryTotalContacts, setDirectoryTotalContacts] = useState<number | null>(null);
  const [directoryDialogOpen, setDirectoryDialogOpen] = useState(false);
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
  const [showNotificationsOnboarding, setShowNotificationsOnboarding] = useState(
    () =>
      isNotificationSupported() &&
      getNotificationPermission() === 'default' &&
      !isDesktopNotificationsOnboardingDismissed(),
  );

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

  const handleFocusChatFromNotification = useCallback(
    (phone: string) => {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      if (phone) next.set('focusPhone', phone);
      setSearchParams(next, { replace: true });
      window.focus();
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<WhatsAppFocusChatDetail>).detail;
      if (!detail?.phone) return;
      handleFocusChatFromNotification(detail.phone);
    };
    window.addEventListener(WHATSAPP_FOCUS_CHAT_EVENT, handler);
    return () => window.removeEventListener(WHATSAPP_FOCUS_CHAT_EVENT, handler);
  }, [handleFocusChatFromNotification]);

  const handleDismissNotificationsOnboarding = useCallback(() => {
    dismissDesktopNotificationsOnboarding();
    setShowNotificationsOnboarding(false);
  }, []);

  const handleGoToNotificationSettings = useCallback(() => {
    handleDismissNotificationsOnboarding();
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'settings');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, handleDismissNotificationsOnboarding]);

  const handleInboxMetrics = useCallback((metrics: WhatsAppInboxMetrics) => {
    setInboxTotalContacts(metrics.totalConversations);
  }, []);

  const fetchDirectoryStats = useCallback(async () => {
    try {
      const stats = await directoryService.getStats();
      setDirectoryTotalContacts(stats.total);
    } catch {
      // Fallback silencioso
    }
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
  }, [days]);

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
        errorMessage: row.errorMessage,
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
  }, [days]);

  useEffect(() => {
    loadMetrics();
    loadLogs();
    fetchDirectoryStats();
  }, [loadMetrics, loadLogs, fetchDirectoryStats]);

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
        directoryTotalContacts={directoryTotalContacts}
        onOpenDirectory={() => setDirectoryDialogOpen(true)}
        onOpenBulk={() => setBulkOpen(true)}
      />

      {showNotificationsOnboarding && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          onClose={handleDismissNotificationsOnboarding}
          action={
            <Button color="inherit" size="small" onClick={handleGoToNotificationSettings}>
              Activar en Ajustes
            </Button>
          }
        >
          Activa las notificaciones de escritorio en Ajustes para escuchar alertas cuando el CRM esté en
          segundo plano.
        </Alert>
      )}

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
              <Tooltip title="Borra documentos en Firestore (whatsapp_message_log). No modifica el directorio ni conversaciones.">
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
                Se eliminarán filas de la tabla <strong>whatsapp_message_log</strong> en Supabase. Las métricas y la
                tabla de esta pestaña se basan en esos datos; al borrarlos, los contadores quedarán en cero (salvo el
                directorio, que no se toca).
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

          {/* Tasa de respuesta y Directorio */}
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
                      Leads / Directorio
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

          {/* Por tipo de mensaje: sesión (ventana 24h) vs plantilla/campaña */}
          {metrics?.byKind && (
            <Card elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Por tipo de mensaje
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Tipo</TableCell>
                        <TableCell align="right">Enviados (sin fallos)</TableCell>
                        <TableCell align="right">Entregados</TableCell>
                        <TableCell align="right">Leídos</TableCell>
                        <TableCell align="right">Fallidos</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {([
                        ['Sesión 24h', metrics.byKind.session],
                        ['Plantilla / campaña', metrics.byKind.template],
                      ] as const).map(([label, data]) => (
                        <TableRow key={label} hover>
                          <TableCell>
                            <Chip
                              size="small"
                              label={label}
                              color={label.startsWith('Sesión') ? 'info' : 'secondary'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell align="right">{data.outboundOk}</TableCell>
                          <TableCell align="right">{data.delivered}</TableCell>
                          <TableCell align="right">{data.read}</TableCell>
                          <TableCell align="right">{data.failed}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}

          {/* Por plantilla de Meta accionada */}
          {metrics?.byTemplate && Object.keys(metrics.byTemplate).length > 0 && (
            <Card elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                  Por plantilla (Meta)
                </Typography>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Plantilla</TableCell>
                        <TableCell align="right">Enviados (sin fallos)</TableCell>
                        <TableCell align="right">Entregados</TableCell>
                        <TableCell align="right">Leídos</TableCell>
                        <TableCell align="right">Fallidos</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(metrics.byTemplate).map(([name, data]) => (
                        <TableRow key={name} hover>
                          <TableCell>
                            <Chip size="small" label={name} variant="outlined" color="secondary" />
                          </TableCell>
                          <TableCell align="right">{data.outboundOk}</TableCell>
                          <TableCell align="right">{data.delivered}</TableCell>
                          <TableCell align="right">{data.read}</TableCell>
                          <TableCell align="right">{data.failed}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          )}

          {/* Envíos masivos del panel — desglose por destinatario */}
          <BroadcastJobsSection
            days={days}
            initialJobId={broadcastJobParam}
            onInitialJobConsumed={clearBroadcastJobParam}
          />

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
                          <TableCell sx={{ fontWeight: 600 }}>Plantilla</TableCell>
                          <TableCell sx={{ fontWeight: 600 }}>Tipo</TableCell>
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
                              {log.direction === 'inbound' ? (
                                '—'
                              ) : log.templateName ? (
                                <Chip label="Plantilla" size="small" variant="outlined" color="secondary" />
                              ) : (
                                <Chip label="Sesión 24h" size="small" variant="outlined" color="info" />
                              )}
                            </TableCell>
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
                            <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
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

        {activeTab === 5 && (
          <div data-tour="whatsapp-tab-monitoreo">
            <Suspense
              fallback={
                <Box display="flex" justifyContent="center" alignItems="center" minHeight={240}>
                  <CircularProgress />
                </Box>
              }
            >
              <MonitorTab />
            </Suspense>
          </div>
        )}

        {activeTab === 6 && (
          <div data-tour="whatsapp-tab-automations">
            <Suspense
              fallback={
                <Box display="flex" justifyContent="center" alignItems="center" minHeight={240}>
                  <CircularProgress />
                </Box>
              }
            >
              <AutomationsPage />
            </Suspense>
          </div>
        )}
      </Box>

      <WhatsAppBulkSendDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        wabaId={wabaId}
        phoneNumberId={phoneNumberId}
        botLabel={botLabel}
        phoneDisplay={phoneDisplay}
        onViewJobInMetrics={(jobId) => {
          setBulkOpen(false);
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.set('tab', 'metrics');
              next.set('broadcastJob', jobId);
              return next;
            },
            { replace: true },
          );
        }}
      />

      <WhatsAppDirectoryContactsDialog
        open={directoryDialogOpen}
        onClose={() => setDirectoryDialogOpen(false)}
      />
    </>
  );
};

export default WhatsAppCloudPage;
