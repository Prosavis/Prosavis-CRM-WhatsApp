import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  DeleteSweep as DeleteSweepIcon,
  MoreVert as MoreVertIcon,
} from '@mui/icons-material';
import { WHATSAPP_CLOUD_PRODUCTION } from '@/constants/whatsappCloudAccounts';
import {
  getWhatsAppMetrics,
  listWhatsAppMessageLog,
  purgeWhatsAppMessageLog,
} from '@/services/whatsappService';
import type { WhatsAppMetrics } from '@/types/whatsapp';
import ClientSegmentsSection from './ClientSegmentsSection';
import InboundActivitySection from './InboundActivitySection';
import CompletedServicesSection from './CompletedServicesSection';
import OutboundPerformanceSection, {
  type MessageLogRow,
} from './OutboundPerformanceSection';

export const PURGE_WHATSAPP_LOG_CONFIRM_PHRASE = 'BORRAR_LOGS_WHATSAPP';

const { phoneNumberId, phoneDisplay, botLabel } = WHATSAPP_CLOUD_PRODUCTION;

interface MetricsTabProps {
  broadcastJobParam?: string | null;
  onClearBroadcastJobParam?: () => void;
}

const MetricsTab: React.FC<MetricsTabProps> = ({
  broadcastJobParam,
  onClearBroadcastJobParam,
}) => {
  const [metrics, setMetrics] = useState<WhatsAppMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [logs, setLogs] = useState<MessageLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [logsFetchWarning, setLogsFetchWarning] = useState<string | null>(null);
  const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
  const [purgeScope, setPurgeScope] = useState<'line' | 'all'>('line');
  const [purgeTypedPhrase, setPurgeTypedPhrase] = useState('');
  const [purgeLoading, setPurgeLoading] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [advancedMenuAnchor, setAdvancedMenuAnchor] = useState<null | HTMLElement>(null);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError(null);
    try {
      const data = await getWhatsAppMetrics(days, phoneNumberId);
      setMetrics(data);
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
      setLogs(
        rows.map((row) => ({
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
        })),
      );
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
    void loadMetrics();
    void loadLogs();
  }, [loadMetrics, loadLogs]);

  const periodSelect = (
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
  );

  return (
    <div data-tour="whatsapp-tab-metrics">
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 1.5, minHeight: 28 }}
      >
        <Typography variant="caption" color="text.secondary">
          {metrics?.dataQuality && !metricsLoading
            ? `Filas leídas · log: ${metrics.dataQuality.messageLogRows.toLocaleString('es-CO')} · directorio: ${metrics.dataQuality.directoryRows.toLocaleString('es-CO')} · citas COMPLETED: ${metrics.dataQuality.appointmentRows.toLocaleString('es-CO')}`
            : '\u00a0'}
        </Typography>
        <IconButton
          size="small"
          aria-label="Opciones avanzadas de métricas"
          onClick={(e) => setAdvancedMenuAnchor(e.currentTarget)}
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
      </Stack>

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

      {metricsError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {metricsError}
        </Alert>
      )}

      <ClientSegmentsSection
        segments={metrics?.clientSegments}
        clients={metrics?.directoryClients}
        loading={metricsLoading}
        onReload={() => void loadMetrics()}
      />

      <InboundActivitySection
        series={metrics?.inboundTimeseries}
        loading={metricsLoading}
        days={days}
        periodControl={periodSelect}
      />

      <CompletedServicesSection
        series={metrics?.completedServicesTimeseries}
        appointments={metrics?.completedAppointments}
        meta={metrics?.completedMeta}
        loading={metricsLoading}
      />

      <OutboundPerformanceSection
        metrics={metrics}
        metricsLoading={metricsLoading}
        days={days}
        logs={logs}
        logsLoading={logsLoading}
        logsFetchWarning={logsFetchWarning}
        onClearLogsWarning={() => setLogsFetchWarning(null)}
        broadcastJobParam={broadcastJobParam}
        onInitialJobConsumed={onClearBroadcastJobParam}
      />
    </div>
  );
};

export default MetricsTab;
