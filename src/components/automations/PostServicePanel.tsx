import React, { useMemo, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  POST_SERVICE_AUTOMATIONS_QUERY_KEY,
  usePostServiceAutomationsDashboard,
} from '@/hooks/usePostServiceAutomationsDashboard';
import {
  retryPostServiceAutomation,
  runPostServiceDryRun,
  setPostServiceRecipientPreference,
} from '@/services/postServiceAutomationsService';
import {
  POST_SERVICE_OUTCOME_COLOR,
  POST_SERVICE_OUTCOME_LABEL,
  type PostServiceAutomationEvent,
} from '@/types/postServiceAutomations';

const KPI_CONFIG = [
  { key: 'scheduled', label: 'Programados', color: 'info.main' },
  { key: 'pending', label: 'Pendientes', color: 'warning.main' },
  { key: 'sent', label: 'Enviados', color: 'success.main' },
  { key: 'failed', label: 'Fallidos', color: 'error.main' },
] as const;

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

function formatServiceDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00-05:00`).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Bogota',
  });
}

function getActionMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export interface PostServicePanelProps {
  onOpenHistory?: () => void;
}

const PostServicePanel: React.FC<PostServicePanelProps> = ({ onOpenHistory }) => {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error, refetch } =
    usePostServiceAutomationsDashboard();
  const [feedback, setFeedback] = useState<{
    severity: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const retryMutation = useMutation({
    mutationFn: retryPostServiceAutomation,
    onSuccess: async (_, variables) => {
      setFeedback({
        severity: 'success',
        message: `Reintento solicitado para la cita ${variables.appointmentId}.`,
      });
      await queryClient.invalidateQueries({ queryKey: POST_SERVICE_AUTOMATIONS_QUERY_KEY });
    },
    onError: (mutationError) => {
      setFeedback({
        severity: 'error',
        message: getActionMessage(mutationError, 'No fue posible reintentar el mensaje.'),
      });
    },
  });

  const dryRunMutation = useMutation({
    mutationFn: runPostServiceDryRun,
    onSuccess: async (result) => {
      const stats = Object.entries(result.stats ?? {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(' · ');
      setFeedback({
        severity: 'info',
        message: `Simulación completada${stats ? ` · ${stats}` : ''}. No se envió ningún WhatsApp.`,
      });
      await queryClient.invalidateQueries({ queryKey: POST_SERVICE_AUTOMATIONS_QUERY_KEY });
    },
    onError: (mutationError) => {
      setFeedback({
        severity: 'error',
        message: getActionMessage(mutationError, 'No fue posible ejecutar la simulación.'),
      });
    },
  });

  const preferenceMutation = useMutation({
    mutationFn: setPostServiceRecipientPreference,
    onSuccess: async (_, variables) => {
      setFeedback({
        severity: 'success',
        message: variables.enabled
          ? 'Automatización post-servicio activada para el contacto.'
          : 'Automatización post-servicio desactivada para el contacto.',
      });
      await queryClient.invalidateQueries({ queryKey: POST_SERVICE_AUTOMATIONS_QUERY_KEY });
    },
    onError: (mutationError) => {
      setFeedback({
        severity: 'error',
        message: getActionMessage(mutationError, 'No fue posible cambiar la preferencia.'),
      });
    },
  });

  const attemptCountByAppointment = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of data?.recentEvents ?? []) {
      if (!event.appointment_id) continue;
      counts.set(event.appointment_id, (counts.get(event.appointment_id) ?? 0) + 1);
    }
    return counts;
  }, [data?.recentEvents]);

  if (isLoading && !data) {
    return (
      <Box
        role="status"
        aria-label="Cargando automatizaciones post-servicio"
        sx={{ display: 'flex', justifyContent: 'center', py: 7 }}
      >
        <CircularProgress />
      </Box>
    );
  }

  const recentEvents = data?.recentEvents ?? [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ md: 'center' }}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <TaskAltIcon color="primary" />
                <Typography variant="h6" fontWeight={700}>
                  Seguimiento post-servicio
                </Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Monitorea la plantilla <strong>service_finalizado</strong>. Desde este panel solo
                puedes consultar, simular o reintentar fallos individuales.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Última ejecución: {formatDateTime(data?.meta.lastRunAt)}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Tooltip title="Evalúa una cita elegible sin enviar mensajes">
                <span>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={
                      dryRunMutation.isPending ? (
                        <CircularProgress size={14} />
                      ) : (
                        <ScienceOutlinedIcon />
                      )
                    }
                    disabled={dryRunMutation.isPending}
                    onClick={() => dryRunMutation.mutate({})}
                    sx={{ textTransform: 'none' }}
                  >
                    Dry-run
                  </Button>
                </span>
              </Tooltip>
              <Button
                size="small"
                variant="outlined"
                startIcon={<HistoryIcon />}
                onClick={onOpenHistory}
                disabled={!onOpenHistory}
                sx={{ textTransform: 'none' }}
              >
                Historial
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={isFetching ? <CircularProgress size={14} /> : <RefreshIcon />}
                onClick={() => void refetch()}
                disabled={isFetching}
                sx={{ textTransform: 'none' }}
              >
                Actualizar
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              Reintentar carga
            </Button>
          }
        >
          <AlertTitle>Error al cargar post-servicio</AlertTitle>
          {error.message}
        </Alert>
      )}

      {feedback && (
        <Alert
          severity={feedback.severity}
          onClose={() => setFeedback(null)}
          aria-live="polite"
        >
          {feedback.message}
        </Alert>
      )}

      {data && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(4, minmax(0, 1fr))',
            },
            gap: 1.5,
          }}
        >
          {KPI_CONFIG.map((kpi) => (
            <Card key={kpi.key} variant="outlined">
              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                <Typography variant="body2" color="text.secondary">
                  {kpi.label}
                </Typography>
                <Typography variant="h4" fontWeight={700} sx={{ color: kpi.color }}>
                  {data.summary[kpi.key]}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}

      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            spacing={1}
            sx={{ mb: 1.5 }}
          >
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Eventos recientes
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {recentEvents.length} evento{recentEvents.length === 1 ? '' : 's'} · simulados{' '}
                {data?.summary.dryRun ?? 0} · omitidos {data?.summary.skipped ?? 0}
              </Typography>
            </Box>
          </Stack>

          {recentEvents.length === 0 ? (
            <Box
              sx={{
                border: '1px dashed',
                borderColor: 'divider',
                borderRadius: 2,
                py: 5,
                px: 2,
                textAlign: 'center',
              }}
            >
              <Typography variant="body1" fontWeight={600}>
                Aún no hay eventos post-servicio
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Actualiza el panel o ejecuta un dry-run para comprobar una cita elegible.
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small" aria-label="Eventos recientes post-servicio">
                <TableHead>
                  <TableRow>
                    <TableCell>Estado</TableCell>
                    <TableCell>Cita / servicio</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Error</TableCell>
                    <TableCell align="center">Intentos</TableCell>
                    <TableCell align="center">Activo</TableCell>
                    <TableCell align="right">Acción</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentEvents.map((event) => (
                    <PostServiceEventRow
                      key={event.id}
                      event={event}
                      attemptCount={
                        event.appointment_id
                          ? (attemptCountByAppointment.get(event.appointment_id) ?? 1)
                          : 0
                      }
                      retryPending={
                        retryMutation.isPending &&
                        retryMutation.variables.appointmentId === event.appointment_id
                      }
                      preferencePending={
                        preferenceMutation.isPending &&
                        preferenceMutation.variables.directoryId === event.directory_id
                      }
                      onRetry={(appointmentId) =>
                        retryMutation.mutate({ appointmentId })
                      }
                      onPreferenceChange={(directoryId, enabled) =>
                        preferenceMutation.mutate({ directoryId, enabled })
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

function PostServiceEventRow({
  event,
  attemptCount,
  retryPending,
  preferencePending,
  onRetry,
  onPreferenceChange,
}: {
  event: PostServiceAutomationEvent;
  attemptCount: number;
  retryPending: boolean;
  preferencePending: boolean;
  onRetry: (appointmentId: string) => void;
  onPreferenceChange: (directoryId: string, enabled: boolean) => void;
}) {
  const canRetry =
    (event.outcome === 'failed' || event.outcome === 'pending') &&
    Boolean(event.appointment_id);
  const enabled = event.outcome !== 'skipped_disabled';

  return (
    <TableRow hover>
      <TableCell>
        <Chip
          size="small"
          label={POST_SERVICE_OUTCOME_LABEL[event.outcome] ?? event.outcome}
          color={POST_SERVICE_OUTCOME_COLOR[event.outcome] ?? 'default'}
          variant="outlined"
        />
      </TableCell>
      <TableCell>
        <Typography variant="body2" fontFamily="monospace">
          {event.appointment_id ? event.appointment_id.slice(0, 10) : '—'}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatServiceDate(event.service_date)}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2">{event.recipient_name || '—'}</Typography>
        <Typography variant="caption" color="text.secondary">
          {event.recipient_phone || 'Sin teléfono'}
        </Typography>
      </TableCell>
      <TableCell sx={{ maxWidth: 280 }}>
        <Tooltip title={event.error_message ?? ''}>
          <Typography variant="body2" color={event.error_message ? 'error' : 'text.secondary'} noWrap>
            {event.error_message || '—'}
          </Typography>
        </Tooltip>
      </TableCell>
      <TableCell align="center">{attemptCount || '—'}</TableCell>
      <TableCell align="center">
        {event.directory_id ? (
          <Switch
            size="small"
            checked={enabled}
            disabled={preferencePending}
            inputProps={{
              'aria-label': `${enabled ? 'Desactivar' : 'Activar'} post-servicio para ${
                event.recipient_name || 'contacto'
              }`,
            }}
            onChange={(_, checked) =>
              onPreferenceChange(event.directory_id as string, checked)
            }
          />
        ) : (
          <Typography variant="caption" color="text.secondary">
            —
          </Typography>
        )}
      </TableCell>
      <TableCell align="right">
        {canRetry ? (
          <Button
            size="small"
            startIcon={retryPending ? <CircularProgress size={13} /> : <ReplayIcon />}
            disabled={retryPending}
            onClick={() => onRetry(event.appointment_id as string)}
            sx={{ textTransform: 'none' }}
          >
            Reintentar
          </Button>
        ) : (
          <Typography variant="caption" color="text.secondary">
            —
          </Typography>
        )}
      </TableCell>
    </TableRow>
  );
}

export default PostServicePanel;
