import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { inboxQueryKeys } from '@/hooks/inboxQueryKeys';
import { useWhatsAppMetricsQueries } from '@/hooks/useWhatsAppMetricsQueries';
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
import { PROSAVIS_CLEANING_SERVICE_ID } from '@/constants/cleaningService';
import { WHATSAPP_CLOUD_PRODUCTION } from '@/constants/whatsappCloudAccounts';
import { useSearchParams } from 'react-router-dom';
import { purgeWhatsAppMessageLog } from '@/services/whatsappService';
import {
  applyMetricsScope,
  applyMetricsVista,
  metricsPeriodLabel,
  resolveMetricsDays,
  resolveMetricsVista,
} from '@/utils/metricsVistas';
import {
  applyOutboundWindow,
  filterHeatmapPoints,
  selectCompletedWindow,
  selectInboundWindow,
} from '@/utils/metricsHistoricalWindows';
import ClientSegmentsSection from './ClientSegmentsSection';
import InboundActivitySection from './InboundActivitySection';
import CompletedServicesSection from './CompletedServicesSection';
import OutboundPerformanceSection from './OutboundPerformanceSection';
import CalidadSection from './CalidadSection';
import FriccionSection from './FriccionSection';
import HeatmapSection, { type HeatmapMode } from './HeatmapSection';
import AppDataSection from './app/AppDataSection';
import MetricsPeriodControl from './shared/MetricsPeriodControl';
import MetricsShell from './shared/MetricsShell';
import MetricsPageState from './shared/MetricsPageState';
import MetricsViewHeader from './shared/MetricsViewHeader';
import LifetimeRevenueBanner from './shared/LifetimeRevenueBanner';

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
  const completedDays = resolveMetricsDays(searchParams, 'completedDays');
  const mapDays = resolveMetricsDays(searchParams, 'mapDays');
  const activityDays = resolveMetricsDays(searchParams, 'activityDays');
  const outboundDays = resolveMetricsDays(searchParams, 'outboundDays');
  const appDays = resolveMetricsDays(searchParams, 'appDays');
  const heatmapPreferGps = searchParams.get('source') !== 'address';
  const heatmapStatus = searchParams.get('status') ?? 'all';
  const heatmapLayer = searchParams.get('layer') ?? 'all';
  const heatmapMode: HeatmapMode =
    searchParams.get('mapMode') === 'points' ? 'points' : 'density';
  const [logsFetchWarning, setLogsFetchWarning] = useState<string | null>(null);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeScope, setPurgeScope] = useState<'line' | 'all'>('line');
  const [purgeTypedPhrase, setPurgeTypedPhrase] = useState('');
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [advancedMenuAnchor, setAdvancedMenuAnchor] = useState<null | HTMLElement>(null);

  const {
    metricsQuery,
    appQuery,
    qualityQuery,
    heatmapQuery,
    directoryQuery,
    completedQuery,
    logsQuery,
  } = useWhatsAppMetricsQueries({
    vista,
    phoneNumberId,
    heatmap: {
      preferGps: heatmapPreferGps,
      status: heatmapStatus,
      layer: heatmapLayer,
    },
  });

  const metrics = metricsQuery.data ?? null;
  const metricsLoading = metricsQuery.isPending;
  const metricsError = metricsQuery.error instanceof Error ? metricsQuery.error.message : null;
  const logs = logsQuery.data ?? [];
  const logsLoading = logsQuery.isPending;

  const loadMetrics = () => metricsQuery.refetch();
  const todayKey = metrics?.today ?? new Date().toISOString().slice(0, 10);
  const outboundWindowed = metrics ? applyOutboundWindow(metrics, outboundDays) : null;
  const heatmapWindowed = heatmapQuery.data
    ? {
      ...heatmapQuery.data,
      points: filterHeatmapPoints(heatmapQuery.data.points, mapDays, todayKey),
    }
    : heatmapQuery.data;
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
      onVistaChange={(next) => {
        setSearchParams(applyMetricsVista(searchParams, next), { replace: true });
      }}
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
                await queryClient.invalidateQueries({
                  queryKey: inboxQueryKeys.metrics(phoneNumberId, PROSAVIS_CLEANING_SERVICE_ID),
                });
                await queryClient.invalidateQueries({ queryKey: inboxQueryKeys.metricsLogs(phoneNumberId) });
                await queryClient.invalidateQueries({
                  queryKey: inboxQueryKeys.appMetrics(PROSAVIS_CLEANING_SERVICE_ID),
                });
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

      {vista === 'resumen' && (
        <MetricsPageState
          loading={metricsLoading}
          error={metricsError}
          empty={!metrics?.completedMeta && (metrics?.lifetimeCollectedTotal ?? 0) === 0}
          onRetry={() => void loadMetrics()}
        >
          <MetricsPeriodControl
            days={completedDays}
            onDaysChange={(next) => {
              setSearchParams(
                applyMetricsScope(searchParams, {
                  completedDays: next === 30 ? null : String(next),
                }),
                { replace: true },
              );
            }}
          />
          <MetricsViewHeader
            title="Resumen operativo"
            purpose="Ingresos históricos cobrados y servicios completados. El periodo solo filtra la serie ya cargada."
            periodLabel={metricsPeriodLabel(completedDays)}
            universeLabel={`${(metrics?.completedMeta?.totalCompleted ?? 0).toLocaleString('es-CO')} servicios históricos`}
            updatedAt={metricsQuery.dataUpdatedAt}
            insights={[
              {
                label: 'Citas pagadas',
                value: (metrics?.lifetimePaidAppointmentCount ?? 0).toLocaleString('es-CO'),
                tone: 'positive',
              },
              {
                label: 'Completados en el periodo',
                value: (metrics ? selectCompletedWindow(metrics, completedDays).total : 0).toLocaleString('es-CO'),
              },
            ]}
          />
          <LifetimeRevenueBanner
            lifetimeCollectedTotal={metrics?.lifetimeCollectedTotal ?? 0}
            lifetimePaidAppointmentCount={metrics?.lifetimePaidAppointmentCount ?? 0}
            loading={false}
          />
          <CompletedServicesSection
            series={metrics ? selectCompletedWindow(metrics, completedDays).series : undefined}
            appointments={completedQuery.data}
            meta={metrics?.completedMeta
              ? {
                ...metrics.completedMeta,
                inSelectedPeriod: selectCompletedWindow(metrics, completedDays).total,
              }
              : metrics?.completedMeta}
            loading={false}
          />
        </MetricsPageState>
      )}

      {vista === 'app' && (
        <MetricsPageState
          loading={appQuery.isPending}
          error={appQuery.error instanceof Error ? appQuery.error.message : null}
          empty={!appQuery.data}
          onRetry={() => void appQuery.refetch()}
        >
          <AppDataSection
            data={appQuery.data ?? null}
            days={appDays}
            onDaysChange={(next) => {
              setSearchParams(
                applyMetricsScope(searchParams, { appDays: next === 30 ? null : String(next) }),
                { replace: true },
              );
            }}
            updatedAt={appQuery.dataUpdatedAt}
          />
        </MetricsPageState>
      )}

      {vista === 'mapa' && (
        <>
          <MetricsPeriodControl
            days={mapDays}
            onDaysChange={(next) => {
              setSearchParams(
                applyMetricsScope(searchParams, {
                  mapDays: next === 30 ? null : String(next),
                }),
                { replace: true },
              );
            }}
          />
          <HeatmapSection
          data={heatmapWindowed}
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
          periodLabel={metricsPeriodLabel(mapDays)}
          updatedAt={heatmapQuery.dataUpdatedAt}
          onRetry={() => void heatmapQuery.refetch()}
        />
        </>
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
            clients={directoryQuery.data}
            loading={directoryQuery.isPending}
            onReload={() => void loadMetrics()}
          />
        </MetricsPageState>
      )}

      {vista === 'actividad' && (
        <MetricsPageState
          loading={metricsLoading}
          error={metricsError}
          empty={!metrics?.inboundTotals}
          onRetry={() => void loadMetrics()}
        >
          <MetricsViewHeader
            title="Actividad inbound"
            purpose="Mide demanda recibida por personas, mensajes y ventanas temporales, sin mezclarla con servicios completados."
            periodLabel={metricsPeriodLabel(activityDays)}
            universeLabel={`${(metrics ? selectInboundWindow(metrics, activityDays).totals.uniquePeople : 0).toLocaleString('es-CO')} contactos únicos`}
            updatedAt={metricsQuery.dataUpdatedAt}
            insights={[
              {
                label: 'Contactos inbound',
                value: (metrics ? selectInboundWindow(metrics, activityDays).totals.uniquePeople : 0).toLocaleString('es-CO'),
              },
              {
                label: 'Nuevos',
                value: (metrics ? selectInboundWindow(metrics, activityDays).totals.newPeople : 0).toLocaleString('es-CO'),
                tone: 'positive',
              },
              {
                label: 'Mensajes recibidos',
                value: (metrics ? selectInboundWindow(metrics, activityDays).totals.messagesReceived : 0).toLocaleString('es-CO'),
              },
            ]}
          />
          <MetricsPeriodControl
            days={activityDays}
            onDaysChange={(next) => {
              setSearchParams(
                applyMetricsScope(searchParams, {
                  activityDays: next === 30 ? null : String(next),
                }),
                { replace: true },
              );
            }}
          />
          <InboundActivitySection
            series={metrics ? selectInboundWindow(metrics, activityDays).series : undefined}
            totals={metrics ? selectInboundWindow(metrics, activityDays).totals : undefined}
            loading={false}
            days={activityDays}
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
            periodLabel={metricsPeriodLabel(outboundDays)}
            universeLabel={`${(
              outboundWindowed?.outboundTotals?.uniqueContacts.messaged ??
              outboundWindowed?.uniqueContactsMessaged ??
              0
            ).toLocaleString('es-CO')} contactos alcanzados`}
            updatedAt={metricsQuery.dataUpdatedAt}
            insights={[
              {
                label: 'Mensajes enviados',
                value: (outboundWindowed?.totalSent ?? 0).toLocaleString('es-CO'),
              },
              {
                label: 'Contactos que respondieron',
                value: (
                  outboundWindowed?.outboundTotals?.uniqueContacts.responded ??
                  outboundWindowed?.uniqueContactsResponded ??
                  0
                ).toLocaleString('es-CO'),
                tone: 'positive',
              },
              {
                label: 'Tasa por contacto',
                value: `${(outboundWindowed?.responseRate ?? 0).toLocaleString('es-CO')}%`,
                tone: outboundWindowed?.responseRateWarning ? 'warning' : 'default',
              },
            ]}
          />
          <MetricsPeriodControl
            days={outboundDays}
            onDaysChange={(next) => {
              setSearchParams(
                applyMetricsScope(searchParams, {
                  outboundDays: next === 30 ? null : String(next),
                }),
                { replace: true },
              );
            }}
          />
          <OutboundPerformanceSection
            metrics={outboundWindowed}
            days={outboundDays}
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
