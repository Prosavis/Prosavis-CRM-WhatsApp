import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { inboxQueryKeys } from '@/hooks/inboxQueryKeys';
import { PURGE_WHATSAPP_LOG_CONFIRM_PHRASE } from './metricsConstants';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
  TextField,
} from '@mui/material';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { WHATSAPP_CLOUD_PRODUCTION } from '@/constants/whatsappCloudAccounts';
import { useSearchParams } from 'react-router-dom';
import {
  getAppointmentHeatmap,
  getClientQualityMetrics,
  getWhatsAppMetrics,
  listWhatsAppMessageLog,
  purgeWhatsAppMessageLog,
} from '@/services/whatsappService';
import {
  applyMetricsScope,
  applyMetricsVista,
  metricsPeriodRange,
  resolveMetricsDays,
  resolveMetricsVista,
} from '@/utils/metricsVistas';
import ClientSegmentsSection from './ClientSegmentsSection';
import InboundActivitySection from './InboundActivitySection';
import CompletedServicesSection from './CompletedServicesSection';
import OutboundPerformanceSection, {
  type MessageLogRow,
} from './OutboundPerformanceSection';
import CalidadSection from './CalidadSection';
import FriccionSection from './FriccionSection';
import HeatmapSection, { type HeatmapMode } from './HeatmapSection';
import MetricsShell from './shared/MetricsShell';
import MetricsPageState from './shared/MetricsPageState';
import MetricsViewHeader from './shared/MetricsViewHeader';

const { phoneNumberId, phoneDisplay, botLabel } = WHATSAPP_CLOUD_PRODUCTION;

interface MetricsTabProps {
  broadcastJobParam?: string | null;
  onClearBroadcastJobParam?: () => void;
}

const MetricsTab: React.FC<MetricsTabProps> = ({
  broadcastJobParam,
  onClearBroadcastJobParam,
}) => {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const vista = resolveMetricsVista(searchParams);
  const days = resolveMetricsDays(searchParams);
  const heatmapPreferGps = searchParams.get('source') !== 'address';
  const heatmapStatus = searchParams.get('status') ?? 'all';
  const heatmapLayer = searchParams.get('layer') ?? 'all';
  const heatmapMode: HeatmapMode =
    searchParams.get('mapMode') === 'points' ? 'points' : 'density';
  const metricsPeriod = metricsPeriodRange(days);
  const [logsFetchWarning, setLogsFetchWarning] = useState<string | null>(null);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeScope, setPurgeScope] = useState<'line' | 'all'>('line');
  const [purgeTypedPhrase, setPurgeTypedPhrase] = useState('');
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [advancedMenuAnchor, setAdvancedMenuAnchor] = useState<null | HTMLElement>(null);

  const needsOpsMetrics = vista === 'clientes' || vista === 'actividad' || vista === 'outbound';
  const needsQuality = vista === 'calidad' || vista === 'friccion';
  const needsHeatmap = vista === 'mapa';

  const metricsQuery = useQuery({
    queryKey: inboxQueryKeys.metrics(days, phoneNumberId),
    queryFn: () => getWhatsAppMetrics(days, phoneNumberId),
    staleTime: 30_000,
    enabled: needsOpsMetrics,
  });
  const qualityQuery = useQuery({
    queryKey: inboxQueryKeys.qualityMetrics(null, null),
    queryFn: () => getClientQualityMetrics(),
    staleTime: 60_000,
    enabled: needsQuality,
  });
  const heatmapQuery = useQuery({
    queryKey: inboxQueryKeys.appointmentHeatmap({
      source: heatmapPreferGps ? 'gps' : 'address',
      status: heatmapStatus,
      layer: heatmapLayer,
      from: metricsPeriod.from,
      to: metricsPeriod.to,
    }),
    queryFn: () =>
      getAppointmentHeatmap({
        source: heatmapPreferGps ? 'gps' : 'address',
        status: heatmapStatus,
        layer: heatmapLayer,
        from: metricsPeriod.from,
        to: metricsPeriod.to,
      }),
    staleTime: 60_000,
    enabled: needsHeatmap,
  });
  const logsQuery = useQuery({
    queryKey: inboxQueryKeys.metricsLogs(days, phoneNumberId),
    queryFn: async () => {
      const rows = await listWhatsAppMessageLog({ days, phoneNumberId, limit: 500 });
      return rows.map((row) => ({
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
      })) satisfies MessageLogRow[];
    },
    staleTime: 30_000,
    enabled: vista === 'outbound',
  });

  const metrics = metricsQuery.data ?? null;
  const metricsLoading = metricsQuery.isPending;
  const metricsError = metricsQuery.error instanceof Error ? metricsQuery.error.message : null;
  const logs = logsQuery.data ?? [];
  const logsLoading = logsQuery.isPending;

  const loadMetrics = () => metricsQuery.refetch();
  const loadLogs = async () => {
    setLogsFetchWarning(null);
    const result = await logsQuery.refetch();
    if (result.error) {
      setLogsFetchWarning(result.error.message || 'No se pudieron cargar los logs.');
    }
  };

  return (
    <MetricsShell
      vista={vista}
      days={days}
      onVistaChange={(next) => {
        setSearchParams(applyMetricsVista(searchParams, next), { replace: true });
      }}
      onDaysChange={(nextDays) => {
        setSearchParams(
          applyMetricsScope(searchParams, { days: nextDays === 30 ? null : String(nextDays) }),
          { replace: true },
        );
      }}
      context={
        metrics?.dataQuality && !metricsLoading
          ? `Cobertura · ${metrics.dataQuality.messageLogRows.toLocaleString('es-CO')} mensajes · ${metrics.dataQuality.directoryRows.toLocaleString('es-CO')} contactos · ${metrics.dataQuality.appointmentRows.toLocaleString('es-CO')} servicios completados`
          : undefined
      }
      advancedAction={
        <>
          <IconButton
            size="small"
            aria-label="Opciones avanzadas de métricas"
            onClick={(event) => setAdvancedMenuAnchor(event.currentTarget)}
            sx={{ color: 'text.secondary' }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={advancedMenuAnchor}
            open={Boolean(advancedMenuAnchor)}
            onClose={() => setAdvancedMenuAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem
              onClick={() => {
                setAdvancedMenuAnchor(null);
                setPurgeError(null);
                setPurgeTypedPhrase('');
                setPurgeScope('line');
                setPurgeDialogOpen(true);
              }}
            >
              <ListItemIcon>
                <DeleteSweepIcon fontSize="small" color="warning" />
              </ListItemIcon>
              <ListItemText
                primary="Limpiar registro de mensajes"
                secondary="Borra filas de whatsapp_message_log (avanzado)"
              />
            </MenuItem>
          </Menu>
        </>
      }
    >
      <Dialog
        open={purgeDialogOpen}
        onClose={() => !purgeLoading && setPurgeDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Limpiar registro de mensajes</DialogTitle>
        <DialogContent>
          <DialogContentText component="div" sx={{ mb: 2 }}>
            Se eliminarán filas de la tabla <strong>whatsapp_message_log</strong> en Supabase. Las
            métricas y la tabla de esta pestaña se basan en esos datos; al borrarlos, los contadores
            quedarán en cero (salvo el directorio, que no se toca).
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
            <Alert severity="error" sx={{ mt: 2 }}>
              {purgeError}
            </Alert>
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
              purgeLoading || purgeTypedPhrase.trim() !== PURGE_WHATSAPP_LOG_CONFIRM_PHRASE
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
                await queryClient.invalidateQueries({ queryKey: inboxQueryKeys.metrics(days, phoneNumberId) });
                await queryClient.invalidateQueries({ queryKey: inboxQueryKeys.metricsLogs(days, phoneNumberId) });
                await loadMetrics();
                await loadLogs();
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
            {purgeLoading ? (
              <CircularProgress size={22} color="inherit" />
            ) : (
              'Eliminar definitivamente'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {vista === 'mapa' && (
        <HeatmapSection
          data={heatmapQuery.data}
          loading={heatmapQuery.isPending}
          error={heatmapQuery.error instanceof Error ? heatmapQuery.error.message : null}
          preferGps={heatmapPreferGps}
          onPreferGpsChange={(value) => {
            setSearchParams(
              applyMetricsScope(searchParams, { source: value ? null : 'address' }),
              { replace: true },
            );
          }}
          status={heatmapStatus}
          onStatusChange={(value) => {
            setSearchParams(applyMetricsScope(searchParams, { status: value }), { replace: true });
          }}
          layer={heatmapLayer}
          onLayerChange={(value) => {
            setSearchParams(applyMetricsScope(searchParams, { layer: value }), { replace: true });
          }}
          mode={heatmapMode}
          onModeChange={(value) => {
            setSearchParams(
              applyMetricsScope(searchParams, {
                mapMode: value === 'density' ? null : value,
              }),
              { replace: true },
            );
          }}
          periodLabel={`${metricsPeriod.from} – ${metricsPeriod.to}`}
          updatedAt={heatmapQuery.dataUpdatedAt}
          onRetry={() => void heatmapQuery.refetch()}
        />
      )}

      {vista === 'calidad' && (
        <CalidadSection
          metrics={qualityQuery.data}
          loading={qualityQuery.isPending}
          error={qualityQuery.error instanceof Error ? qualityQuery.error.message : null}
          updatedAt={qualityQuery.dataUpdatedAt}
          onRetry={() => void qualityQuery.refetch()}
        />
      )}

      {vista === 'friccion' && (
        <FriccionSection
          metrics={qualityQuery.data}
          loading={qualityQuery.isPending}
          error={qualityQuery.error instanceof Error ? qualityQuery.error.message : null}
          updatedAt={qualityQuery.dataUpdatedAt}
          onRetry={() => void qualityQuery.refetch()}
        />
      )}

      {vista === 'clientes' && (
        <MetricsPageState
          loading={metricsLoading}
          error={metricsError}
          empty={!metrics?.clientSegments || metrics.clientSegments.total === 0}
          onRetry={() => void loadMetrics()}
        >
          <MetricsViewHeader
            title="Directorio y segmentos"
            purpose="Entiende la composición de la audiencia y abre el grupo exacto sobre el que vas a actuar."
            periodLabel="Directorio actual"
            universeLabel={`${(metrics?.clientSegments?.total ?? 0).toLocaleString('es-CO')} contactos`}
            updatedAt={metricsQuery.dataUpdatedAt}
            insights={[
              {
                label: 'Clientes con cita',
                value: (metrics?.clientSegments?.clients ?? 0).toLocaleString('es-CO'),
              },
              {
                label: 'Recurrentes',
                value: (metrics?.clientSegments?.recurring ?? 0).toLocaleString('es-CO'),
                tone: 'positive',
              },
              {
                label: 'Para reactivar',
                value: (metrics?.clientSegments?.inactive ?? 0).toLocaleString('es-CO'),
                tone: 'warning',
              },
            ]}
          />
          <ClientSegmentsSection
            segments={metrics?.clientSegments}
            clients={metrics?.directoryClients}
            loading={false}
            onReload={() => void loadMetrics()}
          />
        </MetricsPageState>
      )}

      {vista === 'actividad' && (
        <MetricsPageState
          loading={metricsLoading}
          error={metricsError}
          empty={!metrics?.inboundTotals && !metrics?.completedMeta}
          onRetry={() => void loadMetrics()}
        >
          <MetricsViewHeader
            title="Actividad operativa"
            purpose="Compara demanda inbound y servicios completados sin confundir personas, mensajes ni ventanas temporales."
            periodLabel={`Últimos ${days} días`}
            universeLabel={`${(metrics?.inboundTotals?.uniquePeople ?? 0).toLocaleString('es-CO')} contactos únicos`}
            updatedAt={metricsQuery.dataUpdatedAt}
            insights={[
              {
                label: 'Contactos inbound',
                value: (metrics?.inboundTotals?.uniquePeople ?? 0).toLocaleString('es-CO'),
              },
              {
                label: 'Nuevos',
                value: (metrics?.inboundTotals?.newPeople ?? 0).toLocaleString('es-CO'),
                tone: 'positive',
              },
              {
                label: 'Servicios en el periodo',
                value: (metrics?.completedMeta?.inSelectedPeriod ?? 0).toLocaleString('es-CO'),
              },
            ]}
          />
          <InboundActivitySection
            series={metrics?.inboundTimeseries}
            totals={metrics?.inboundTotals}
            loading={false}
            days={days}
          />
          <CompletedServicesSection
            series={metrics?.completedServicesTimeseries}
            appointments={metrics?.completedAppointments}
            meta={metrics?.completedMeta}
            loading={false}
          />
        </MetricsPageState>
      )}

      {vista === 'outbound' && (
        <MetricsPageState
          loading={metricsLoading}
          error={metricsError}
          empty={!metrics || metrics.totalSent === 0}
          onRetry={() => void loadMetrics()}
        >
          <MetricsViewHeader
            title="Rendimiento outbound"
            purpose="Separa volumen de mensajes, alcance único, respuesta y fallos para evaluar cada campaña con su denominador."
            periodLabel={`Últimos ${days} días`}
            universeLabel={`${(
              metrics?.outboundTotals?.uniqueContacts.messaged ??
              metrics?.uniqueContactsMessaged ??
              0
            ).toLocaleString('es-CO')} contactos alcanzados`}
            updatedAt={metricsQuery.dataUpdatedAt}
            insights={[
              {
                label: 'Mensajes enviados',
                value: (metrics?.totalSent ?? 0).toLocaleString('es-CO'),
              },
              {
                label: 'Contactos que respondieron',
                value: (
                  metrics?.outboundTotals?.uniqueContacts.responded ??
                  metrics?.uniqueContactsResponded ??
                  0
                ).toLocaleString('es-CO'),
                tone: 'positive',
              },
              {
                label: 'Tasa por contacto',
                value: `${(metrics?.responseRate ?? 0).toLocaleString('es-CO')}%`,
                tone: metrics?.responseRateWarning ? 'warning' : 'default',
              },
            ]}
          />
          <OutboundPerformanceSection
            metrics={metrics}
            days={days}
            logs={logs}
            logsLoading={logsLoading}
            logsFetchWarning={logsFetchWarning}
            onClearLogsWarning={() => setLogsFetchWarning(null)}
            broadcastJobParam={broadcastJobParam}
            onInitialJobConsumed={onClearBroadcastJobParam}
          />
        </MetricsPageState>
      )}
    </MetricsShell>
  );
};

export default MetricsTab;
