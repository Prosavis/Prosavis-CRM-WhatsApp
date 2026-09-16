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
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SearchIcon from '@mui/icons-material/Search';
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
  type PostServiceAutomationsDashboard,
} from '@/types/postServiceAutomations';
import {
  formatPostServiceServiceDate,
  groupPostServiceContacts,
  isPostServicePreferenceEnabled,
  isPostServiceQueueOutcome,
  phoneKeyFromRecipientPhone,
  postServiceContactKey,
} from '@/utils/postServicePreference';

const KPI_CONFIG = [
  { key: 'scheduled', label: 'Programados', color: 'info.main' },
  { key: 'pending', label: 'Pendientes', color: 'warning.main' },
  { key: 'sent', label: 'Enviados', color: 'success.main' },
  { key: 'failed', label: 'Fallidos', color: 'error.main' },
] as const;

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

function matchesContactSearch(event: PostServiceAutomationEvent, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const digits = needle.replace(/\D/g, '');
  const haystack = [
    event.recipient_name,
    event.recipient_phone,
    event.appointment_id,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (haystack.includes(needle)) return true;
  if (digits.length >= 4) {
    return (event.recipient_phone ?? '').replace(/\D/g, '').includes(digits);
  }
  return false;
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
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'queue' | 'all'>('all');

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
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: POST_SERVICE_AUTOMATIONS_QUERY_KEY });
      const previous = queryClient.getQueryData<PostServiceAutomationsDashboard>(
        POST_SERVICE_AUTOMATIONS_QUERY_KEY,
      );
      queryClient.setQueryData<PostServiceAutomationsDashboard>(
        POST_SERVICE_AUTOMATIONS_QUERY_KEY,
        (current) => {
          if (!current) return current;
          return {
            ...current,
            recentEvents: current.recentEvents.map((event) => {
              const sameDirectory = Boolean(
                variables.directoryId && event.directory_id === variables.directoryId,
              );
              const samePhone = Boolean(
                variables.phone &&
                  phoneKeyFromRecipientPhone(event.recipient_phone) ===
                    phoneKeyFromRecipientPhone(variables.phone),
              );
              return sameDirectory || samePhone
                ? { ...event, postServiceEnabled: variables.enabled }
                : event;
            }),
          };
        },
      );
      return { previous };
    },
    onSuccess: async (_, variables) => {
      setFeedback({
        severity: 'success',
        message: variables.enabled
          ? 'Automatización post-servicio activada para el contacto.'
          : 'Automatización post-servicio desactivada para el contacto.',
      });
      await queryClient.invalidateQueries({ queryKey: POST_SERVICE_AUTOMATIONS_QUERY_KEY });
    },
    onError: (mutationError, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(POST_SERVICE_AUTOMATIONS_QUERY_KEY, context.previous);
      }
      setFeedback({
        severity: 'error',
        message: getActionMessage(mutationError, 'No fue posible cambiar la preferencia.'),
      });
    },
  });

  const contactRows = useMemo(() => {
    const grouped = groupPostServiceContacts(data?.recentEvents ?? []);
    const filtered = grouped.filter((event) => {
      if (view === 'queue' && !isPostServiceQueueOutcome(event.outcome)) return false;
      return matchesContactSearch(event, search);
    });
    return [...filtered].sort((left, right) => {
      const leftQueue = isPostServiceQueueOutcome(left.outcome) ? 0 : 1;
      const rightQueue = isPostServiceQueueOutcome(right.outcome) ? 0 : 1;
      if (leftQueue !== rightQueue) return leftQueue - rightQueue;
      return String(right.created_at ?? '').localeCompare(String(left.created_at ?? ''));
    });
  }, [data?.recentEvents, search, view]);

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
                Apaga <strong>Enviar</strong> para que ese cliente no reciba más
                {' '}<strong>service_finalizado</strong>. Esta tabla es por cliente; el log de cada
                envío está en Historial.
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
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            spacing={1.5}
            sx={{ mb: 1.5 }}
          >
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Clientes
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {contactRows.length} cliente{contactRows.length === 1 ? '' : 's'} · busca por nombre
                o teléfono y apaga el envío
              </Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={view}
                onChange={(_, next: 'queue' | 'all' | null) => {
                  if (next) setView(next);
                }}
                aria-label="Filtro de clientes post-servicio"
              >
                <ToggleButton value="all" sx={{ textTransform: 'none' }}>
                  Todos
                </ToggleButton>
                <ToggleButton value="queue" sx={{ textTransform: 'none' }}>
                  Por enviar
                </ToggleButton>
              </ToggleButtonGroup>
              <TextField
                size="small"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente o teléfono"
                InputProps={{
                  startAdornment: (
                    <SearchIcon fontSize="small" sx={{ mr: 0.5, color: 'text.secondary' }} />
                  ),
                }}
                sx={{ minWidth: { sm: 260 } }}
              />
            </Stack>
          </Stack>

          {contactRows.length === 0 ? (
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
                {search ? 'Ningún cliente coincide con la búsqueda' : 'Aún no hay clientes post-servicio'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {search
                  ? 'Prueba con el nombre o los últimos dígitos del teléfono.'
                  : 'Actualiza el panel o abre Historial para ver envíos anteriores.'}
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small" aria-label="Clientes post-servicio">
                <TableHead>
                  <TableRow>
                    <TableCell>Estado</TableCell>
                    <TableCell>Última cita</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Detalle</TableCell>
                    <TableCell align="center">Enviar</TableCell>
                    <TableCell align="right">Acción</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {contactRows.map((event) => (
                    <PostServiceEventRow
                      key={postServiceContactKey(event)}
                      event={event}
                      retryPending={
                        retryMutation.isPending &&
                        retryMutation.variables.appointmentId === event.appointment_id
                      }
                      preferencePending={
                        preferenceMutation.isPending &&
                        (preferenceMutation.variables.directoryId
                          ? preferenceMutation.variables.directoryId === event.directory_id
                          : phoneKeyFromRecipientPhone(preferenceMutation.variables.phone) ===
                            phoneKeyFromRecipientPhone(event.recipient_phone))
                      }
                      onRetry={(appointmentId) =>
                        retryMutation.mutate({ appointmentId })
                      }
                      onPreferenceChange={(enabled) =>
                        preferenceMutation.mutate({
                          directoryId: event.directory_id,
                          phone: event.recipient_phone,
                          enabled,
                        })
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
  retryPending,
  preferencePending,
  onRetry,
  onPreferenceChange,
}: {
  event: PostServiceAutomationEvent;
  retryPending: boolean;
  preferencePending: boolean;
  onRetry: (appointmentId: string) => void;
  onPreferenceChange: (enabled: boolean) => void;
}) {
  const enabled = isPostServicePreferenceEnabled(event);
  const canToggle = Boolean(event.directory_id || event.recipient_phone);
  const canRetry =
    enabled &&
    isPostServiceQueueOutcome(event.outcome) &&
    Boolean(event.appointment_id);

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
          {formatPostServiceServiceDate(event.service_date)}
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
      <TableCell align="center">
        {canToggle ? (
          <Tooltip
            title={
              enabled
                ? 'Apaga para que este cliente no reciba más el seguimiento post-servicio'
                : 'Enciende para volver a enviarle el seguimiento post-servicio'
            }
          >
            <Switch
              size="small"
              checked={enabled}
              disabled={preferencePending}
              inputProps={{
                'aria-label': `${enabled ? 'Desactivar' : 'Activar'} post-servicio para ${
                  event.recipient_name || 'contacto'
                }`,
              }}
              onChange={(_, checked) => onPreferenceChange(checked)}
            />
          </Tooltip>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Sin ficha
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
