import React, { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AlertTitle,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
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
import RefreshIcon from '@mui/icons-material/Refresh';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import SendIcon from '@mui/icons-material/Send';
import BlockIcon from '@mui/icons-material/Block';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import HistoryIcon from '@mui/icons-material/History';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  useReactivationAutomationsDashboard,
  REACTIVATION_AUTOMATIONS_QUERY_KEY,
} from '@/hooks/useReactivationAutomationsDashboard';
import {
  runReactivationDryRun,
  runReactivationReal,
  setRecipientReactivationPreference,
  suspendReactivationRecipient,
  retryReactivationStep,
} from '@/services/reactivationAutomationsService';
import {
  REACTIVATION_OUTCOME_COLOR,
  REACTIVATION_OUTCOME_LABEL,
  REACTIVATION_STATUS_COLOR,
  REACTIVATION_STATUS_HINT,
  REACTIVATION_STATUS_LABEL,
  formatNextSendAt,
  formatReactivationDate,
  type ReactivationDashboardRow,
} from '@/types/reactivationAutomations';
import ReactivationDetailDialog from './ReactivationDetailDialog';

function formatDay(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatSchedulerTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

function useCountdown(targetIso: string | undefined): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!targetIso) {
      setLabel(null);
      return;
    }
    const tick = () => {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) {
        setLabel(null);
        return;
      }
      const hours = Math.floor(diff / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1_000);
      setLabel(`${hours}h ${minutes}m ${seconds}s`);
    };
    tick();
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [targetIso]);

  return label;
}

const KPI_META: Array<{
  key:
    | 'enrolled'
    | 'dueToday'
    | 'eligibleNew'
    | 'sentLast7d'
    | 'pausedReply'
    | 'reactivatedApprox';
  label: string;
  hint: string;
  color?: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
  solid?: boolean;
}> = [
  {
    key: 'enrolled',
    label: 'Inscritos',
    hint: 'Contactos ya dentro de la secuencia REACTIVACION (al menos un paso enviado).',
    color: 'primary',
  },
  {
    key: 'dueToday',
    label: 'Debidos hoy',
    hint: 'Contactos cuyo siguiente paso ya toca enviar (incluye elegibles nuevos y reintentos).',
    color: 'warning',
  },
  {
    key: 'eligibleNew',
    label: 'Elegibles nuevos',
    hint: 'Inactivos que aún no están inscritos y les corresponde el paso 1.',
    color: 'info',
  },
  {
    key: 'sentLast7d',
    label: 'Enviados 7d',
    hint: 'Mensajes de campaña REACTIVATION con estado sent/delivered/read en los últimos 7 días (envíos reales).',
    color: 'success',
  },
  {
    key: 'pausedReply',
    label: 'Pausados',
    hint: 'Respondieron después del último contacto; se pausa para atención humana.',
  },
  {
    key: 'reactivatedApprox',
    label: 'Reactivados 30d',
    hint: 'Salidas del programa por haber vuelto a agendar (últimos 30 días).',
    color: 'success',
    solid: true,
  },
];

export interface ReactivationPanelProps {
  onOpenHistory?: () => void;
}

const ReactivationPanel: React.FC<ReactivationPanelProps> = ({ onOpenHistory }) => {
  const queryClient = useQueryClient();
  const [, setSearchParams] = useSearchParams();
  const { data, isLoading, isFetching, error, refetch } = useReactivationAutomationsDashboard();
  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);
  const [retryLoadingId, setRetryLoadingId] = useState<string | null>(null);
  const [suspendLoadingId, setSuspendLoadingId] = useState<string | null>(null);
  const [suspendRow, setSuspendRow] = useState<ReactivationDashboardRow | null>(null);
  const [dryRunBusy, setDryRunBusy] = useState(false);
  const [realBusy, setRealBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; severity: 'success' | 'warning' | 'error' } | null>(
    null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailRow, setDetailRow] = useState<ReactivationDashboardRow | null>(null);

  const countdown = useCountdown(data?.meta.nextSchedulerRunAt);
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    if (!data) return [] as ReactivationDashboardRow[];
    const byId = new Map<string, ReactivationDashboardRow>();
    for (const row of [...data.due, ...data.enrolled]) {
      const prev = byId.get(row.directoryId);
      if (!prev || (row.dueStep && !prev.dueStep)) {
        byId.set(row.directoryId, row);
      }
    }
    return [...byId.values()].sort((a, b) => {
      const da = a.daysInactive ?? 0;
      const db = b.daysInactive ?? 0;
      return db - da;
    });
  }, [data]);

  const dueCount = data?.summary.dueToday ?? 0;
  const lastRunEvents = data?.lastRunEvents ?? [];
  const lastRunIsDry =
    lastRunEvents.length > 0 && lastRunEvents.every((e) => e.outcome === 'dry_run');
  const lastRunSent = lastRunEvents.filter((e) => e.outcome === 'sent').length;
  const lastRunFailed = lastRunEvents.filter((e) => e.outcome === 'failed').length;

  const handleToggle = async (row: ReactivationDashboardRow, enabled: boolean) => {
    setToggleLoadingId(row.directoryId);
    try {
      await setRecipientReactivationPreference({
        directoryId: row.directoryId,
        reactivationsEnabled: enabled,
      });
      await queryClient.invalidateQueries({ queryKey: REACTIVATION_AUTOMATIONS_QUERY_KEY });
    } finally {
      setToggleLoadingId(null);
    }
  };

  const handleRetry = async (row: ReactivationDashboardRow) => {
    const step = row.dueStep ?? (row.sequenceStep < 6 ? row.sequenceStep + 1 : row.sequenceStep);
    if (!step) return;
    setRetryLoadingId(row.directoryId);
    try {
      await retryReactivationStep({ directoryId: row.directoryId, stepNumber: step });
      setActionMsg({ text: `Paso enviado a ${row.recipientName}`, severity: 'success' });
      await queryClient.invalidateQueries({ queryKey: REACTIVATION_AUTOMATIONS_QUERY_KEY });
    } catch (err) {
      setActionMsg({
        text: err instanceof Error ? err.message : 'Error al reintentar',
        severity: 'error',
      });
    } finally {
      setRetryLoadingId(null);
    }
  };

  const handleSuspend = async (row: ReactivationDashboardRow) => {
    setSuspendLoadingId(row.directoryId);
    try {
      await suspendReactivationRecipient({ directoryId: row.directoryId });
      setActionMsg({
        text: `${row.recipientName} suspendido: opt-out activado y fuera de la secuencia. No se le enviarán más reactivaciones.`,
        severity: 'success',
      });
      await queryClient.invalidateQueries({ queryKey: REACTIVATION_AUTOMATIONS_QUERY_KEY });
    } catch (err) {
      setActionMsg({
        text: err instanceof Error ? err.message : 'Error al suspender',
        severity: 'error',
      });
    } finally {
      setSuspendLoadingId(null);
      setSuspendRow(null);
    }
  };

  const handleDryRun = async () => {
    setDryRunBusy(true);
    setActionMsg(null);
    try {
      const result = await runReactivationDryRun(25);
      setActionMsg({
        text: `Simulación OK · debidos=${result.dueCount ?? 0} · simulados=${result.stats?.dryRun ?? 0} · omitidos=${result.stats?.skipped ?? 0}. No se envió ningún WhatsApp.`,
        severity: 'success',
      });
      await queryClient.invalidateQueries({ queryKey: REACTIVATION_AUTOMATIONS_QUERY_KEY });
    } catch (err) {
      setActionMsg({
        text: err instanceof Error ? err.message : 'Dry-run falló',
        severity: 'warning',
      });
    } finally {
      setDryRunBusy(false);
    }
  };

  const handleRealRun = async () => {
    setRealBusy(true);
    setActionMsg(null);
    setConfirmOpen(false);
    try {
      const result = await runReactivationReal();
      setActionMsg({
        text: `Envío real completado · enviados=${result.stats?.sent ?? 0} · fallidos=${result.stats?.failed ?? 0} · omitidos=${result.stats?.skipped ?? 0} · debidos=${result.dueCount ?? 0}`,
        severity: (result.stats?.failed ?? 0) > 0 ? 'warning' : 'success',
      });
      await queryClient.invalidateQueries({ queryKey: REACTIVATION_AUTOMATIONS_QUERY_KEY });
    } catch (err) {
      setActionMsg({
        text: err instanceof Error ? err.message : 'Envío real falló',
        severity: 'error',
      });
    } finally {
      setRealBusy(false);
    }
  };

  const goToHistory = () => {
    if (onOpenHistory) {
      onOpenHistory();
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'automations');
        next.set('auto', 'react-history');
        return next;
      },
      { replace: true },
    );
  };

  if (isLoading && !data) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
        >
          <Box>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <AutoAwesomeIcon color="primary" fontSize="small" />
              <Typography variant="h6" fontWeight={700}>
                Reactivaciones WhatsApp
              </Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Cadencia de 3 meses para clientes inactivos (&gt;30 días). Envío diario a las{' '}
              <strong>12:00 p. m.</strong> (Colombia) y reintentos cada 30 min hasta las 2:30 p. m.
            </Typography>
            {data && (
              <Stack spacing={0.25} sx={{ mt: 1 }}>
                <Typography variant="body2">
                  Próxima ejecución:{' '}
                  <strong>{formatSchedulerTime(data.meta.nextSchedulerRunAt)}</strong>
                  {countdown ? ` · en ${countdown}` : null}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Última corrida:{' '}
                  {data.meta.lastRunAt ? formatSchedulerTime(data.meta.lastRunAt) : '—'}
                  {lastRunIsDry
                    ? ' · fue una simulación (no envió WhatsApp)'
                    : lastRunEvents.length > 0
                      ? ` · ${lastRunSent} enviados · ${lastRunFailed} fallidos`
                      : ''}
                </Typography>
              </Stack>
            )}
          </Box>

          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Tooltip title="Envía de verdad el paso debido a todos los pendientes de hoy">
              <span>
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  startIcon={realBusy ? <CircularProgress size={14} color="inherit" /> : <SendIcon />}
                  onClick={() => setConfirmOpen(true)}
                  disabled={realBusy || dryRunBusy || dueCount === 0}
                  sx={{ textTransform: 'none' }}
                >
                  Enviar ahora
                </Button>
              </span>
            </Tooltip>
            <Tooltip title="Solo calcula quién recibiría mensaje. No contacta a Meta ni WhatsApp.">
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={dryRunBusy ? <CircularProgress size={14} /> : <ScienceOutlinedIcon />}
                  onClick={() => void handleDryRun()}
                  disabled={dryRunBusy || realBusy}
                  sx={{ textTransform: 'none' }}
                >
                  Simular (dry-run)
                </Button>
              </span>
            </Tooltip>
            <Button
              size="small"
              variant="outlined"
              startIcon={isFetching ? <CircularProgress size={14} /> : <RefreshIcon />}
              onClick={() => void refetch()}
              sx={{ textTransform: 'none' }}
            >
              Actualizar
            </Button>
          </Stack>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error">
          <AlertTitle>Error al cargar</AlertTitle>
          {error.message}
        </Alert>
      )}

      {actionMsg && (
        <Alert severity={actionMsg.severity} onClose={() => setActionMsg(null)}>
          {actionMsg.text}
        </Alert>
      )}

      {lastRunIsDry && data?.meta.lastRunAt && (
        <Alert severity="info" icon={<InfoOutlinedIcon />}>
          La última corrida ({formatReactivationDate(data.meta.lastRunAt)}) fue una{' '}
          <strong>simulación</strong>. Los eventos con resultado «Simulación (no envió)» no generan
          mensajes de WhatsApp. Usa <strong>Enviar ahora</strong> o espera el cron de las 12:00 p. m.
          para un envío real.
        </Alert>
      )}

      {data && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          {KPI_META.map((kpi) => {
            const value = data.summary[kpi.key] ?? 0;
            return (
              <Tooltip key={kpi.key} title={kpi.hint}>
                <Chip
                  label={`${kpi.label}: ${value}`}
                  color={kpi.color ?? 'default'}
                  variant={kpi.solid ? 'filled' : 'outlined'}
                />
              </Tooltip>
            );
          })}
          <Chip
            label={`Próximo cron: ${formatReactivationDate(data.meta.nextSchedulerRunAt)}`}
            variant="outlined"
          />
          {data.meta.lastRunAt && (
            <Chip
              label={`Último run: ${formatReactivationDate(data.meta.lastRunAt)}`}
              variant="outlined"
            />
          )}
        </Stack>
      )}

      {data && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>
              Pasos de cadencia (3 meses)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Día 0 = ingreso al programa (primer mensaje). Luego semanal el mes 1 y mensual los
              meses 2–3. Si el cliente responde o vuelve a agendar, se pausa o sale del programa.
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(3, 1fr)',
                  lg: 'repeat(6, 1fr)',
                },
                gap: 1.25,
              }}
            >
              {data.meta.steps.map((step, index) => (
                <Box
                  key={step.step}
                  sx={{
                    position: 'relative',
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'divider',
                    bgcolor: index === 0 ? 'rgba(25, 118, 210, 0.04)' : 'background.paper',
                    minHeight: 120,
                  }}
                >
                  <Chip
                    size="small"
                    label={`Día ${step.dayFromEnrollment}`}
                    color={index === 0 ? 'primary' : 'default'}
                    sx={{ mb: 1, fontWeight: 700 }}
                  />
                  <Typography variant="body2" fontWeight={700} sx={{ mb: 0.5, lineHeight: 1.3 }}>
                    {step.label}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', fontFamily: 'monospace', wordBreak: 'break-all' }}
                  >
                    {step.templateName}
                  </Typography>
                  {index > 0 && (
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.75 }}>
                      +{step.gapDaysFromPrevious}d desde el anterior
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}

      <Accordion variant="outlined" disableGutters sx={{ borderRadius: 2, '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Stack direction="row" spacing={1} alignItems="center">
            <InfoOutlinedIcon fontSize="small" color="action" />
            <Typography variant="subtitle2" fontWeight={700}>
              ¿Cómo se calcula?
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <Stack spacing={1.25}>
            <Typography variant="body2">
              <strong>Elegible (nuevo):</strong> cliente real (agendó ≥1 vez), inactivo más de 30 días y
              hasta 120 días, sin opt-out, sin lista negra, sin empresa, y aún no inscrito en la
              secuencia.
            </Typography>
            <Typography variant="body2">
              <strong>Debido hoy:</strong> el siguiente paso de cadencia ya cumplió su gap (día 0, 7,
              14, 28, 56 u 84 desde el ingreso / último envío).
            </Typography>
            <Typography variant="body2">
              <strong>Pausado:</strong> el cliente respondió después del último contacto; no se
              continúa hasta atención humana.
            </Typography>
            <Typography variant="body2">
              <strong>Reactivado:</strong> volvió a agendar (activo ≤30 días) y sale del programa.
            </Typography>
            <Typography variant="body2">
              <strong>Simulación vs envío real:</strong> «Simular (dry-run)» solo escribe eventos con
              resultado <em>dry_run</em>. «Enviar ahora» y el cron de las 12:00 p. m. sí envían
              plantillas por WhatsApp. Los reintentos automáticos corren cada 30 min (12:30–14:30).
            </Typography>
            <Typography variant="body2">
              <strong>Enviar paso</strong> (por fila) fuerza el siguiente paso de esa persona de
              inmediato, sin esperar al cron.
            </Typography>
          </Stack>
        </AccordionDetails>
      </Accordion>

      {lastRunEvents.length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ sm: 'center' }}
              spacing={1}
              sx={{ mb: 1.5 }}
            >
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  Resumen del último run
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {lastRunEvents.length} evento(s)
                  {lastRunIsDry
                    ? ' · simulación'
                    : ` · ${lastRunSent} enviados · ${lastRunFailed} fallidos`}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="text"
                startIcon={<HistoryIcon />}
                onClick={goToHistory}
                sx={{ textTransform: 'none' }}
              >
                Ver historial completo
              </Button>
            </Stack>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
              {Object.entries(
                lastRunEvents.reduce<Record<string, number>>((acc, e) => {
                  acc[e.outcome] = (acc[e.outcome] ?? 0) + 1;
                  return acc;
                }, {}),
              ).map(([outcome, count]) => (
                <Chip
                  key={outcome}
                  size="small"
                  label={`${REACTIVATION_OUTCOME_LABEL[outcome] ?? outcome}: ${count}`}
                  color={REACTIVATION_OUTCOME_COLOR[outcome] ?? 'default'}
                  variant="outlined"
                />
              ))}
            </Stack>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Nombre</TableCell>
                    <TableCell>Paso</TableCell>
                    <TableCell>Resultado</TableCell>
                    <TableCell>Cuándo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {lastRunEvents.slice(0, 8).map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{event.recipient_name || '—'}</TableCell>
                      <TableCell>{event.step_number}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={REACTIVATION_OUTCOME_LABEL[event.outcome] ?? event.outcome}
                          color={REACTIVATION_OUTCOME_COLOR[event.outcome] ?? 'default'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{formatReactivationDate(event.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      <Card variant="outlined">
        <CardContent>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ sm: 'center' }}
            spacing={1}
            sx={{ mb: 1 }}
          >
            <Box>
              <Typography variant="subtitle1" fontWeight={700}>
                Cola e inscritos ({rows.length})
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Contactos debidos hoy e inscritos en la secuencia. El switch <strong>pausa</strong>{' '}
                temporalmente; «Enviar paso» fuerza su siguiente mensaje;{' '}
                <strong>«Suspender»</strong> marca opt-out permanente (no contactar) y lo saca de la
                secuencia.
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
            {(Object.keys(REACTIVATION_STATUS_LABEL) as Array<keyof typeof REACTIVATION_STATUS_LABEL>).map(
              (status) => (
                <Tooltip key={status} title={REACTIVATION_STATUS_HINT[status]}>
                  <Chip
                    size="small"
                    label={REACTIVATION_STATUS_LABEL[status]}
                    color={REACTIVATION_STATUS_COLOR[status]}
                    variant="outlined"
                    sx={{ height: 22 }}
                  />
                </Tooltip>
              ),
            )}
          </Stack>

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Teléfono</TableCell>
                  <TableCell>Última cita</TableCell>
                  <TableCell>Paso</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell>Último contacto</TableCell>
                  <TableCell>Próximo envío</TableCell>
                  <TableCell align="center">Activo</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.slice(0, 200).map((row) => (
                  <TableRow key={row.directoryId} hover>
                    <TableCell>
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => setDetailRow(row)}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 600,
                          p: 0,
                          minWidth: 0,
                          justifyContent: 'flex-start',
                        }}
                      >
                        {row.recipientName}
                      </Button>
                      {row.isRecurring && (
                        <Chip size="small" label="Recurrente" sx={{ mt: 0.5, display: 'flex' }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {row.phone || '—'}
                    </TableCell>
                    <TableCell>
                      {formatDay(row.lastAppointmentDate)}
                      {row.daysInactive != null && (
                        <Typography component="span" variant="caption" color="error" sx={{ ml: 0.75 }}>
                          ({row.daysInactive}d)
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.sequenceStep || 0}
                        {row.dueStep ? ` → ${row.dueStep}` : ''}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.nextStepLabel || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={REACTIVATION_STATUS_HINT[row.status]}>
                        <Chip
                          size="small"
                          label={REACTIVATION_STATUS_LABEL[row.status]}
                          color={REACTIVATION_STATUS_COLOR[row.status]}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell>{formatReactivationDate(row.lastContactAt)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                        {formatNextSendAt(row.nextSendAt, nowMs)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        size="small"
                        checked={row.reactivationsEnabled}
                        disabled={toggleLoadingId === row.directoryId}
                        onChange={(_, checked) => void handleToggle(row, checked)}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        <Button size="small" onClick={() => setDetailRow(row)} sx={{ textTransform: 'none' }}>
                          Ver
                        </Button>
                        <Button
                          size="small"
                          disabled={
                            retryLoadingId === row.directoryId ||
                            row.status === 'opt_out' ||
                            !row.reactivationsEnabled
                          }
                          onClick={() => void handleRetry(row)}
                          sx={{ textTransform: 'none' }}
                        >
                          {retryLoadingId === row.directoryId ? '…' : 'Enviar paso'}
                        </Button>
                        <Tooltip title="Suspender: marca opt-out (no contactar) y saca de la secuencia">
                          <span>
                            <Button
                              size="small"
                              color="error"
                              startIcon={
                                suspendLoadingId === row.directoryId ? (
                                  <CircularProgress size={12} color="inherit" />
                                ) : (
                                  <BlockIcon fontSize="small" />
                                )
                              }
                              disabled={
                                suspendLoadingId === row.directoryId || row.status === 'opt_out'
                              }
                              onClick={() => setSuspendRow(row)}
                              sx={{ textTransform: 'none' }}
                            >
                              Suspender
                            </Button>
                          </span>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      Sin contactos elegibles o inscritos en este momento.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onClose={() => !realBusy && setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirmar envío real de reactivaciones</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            Se enviará por WhatsApp el <strong>paso debido</strong> a{' '}
            <strong>{dueCount}</strong> contacto{dueCount === 1 ? '' : 's'} pendiente
            {dueCount === 1 ? '' : 's'} (plantillas Meta aprobadas).
            <Box component="ul" sx={{ mt: 1.5, pl: 2.5, mb: 0 }}>
              <li>Esto NO es una simulación: los mensajes saldrán al cliente.</li>
              <li>Si algún envío falla, los reintentos automáticos lo intentarán cada 30 min (hasta 14:30).</li>
              <li>También puedes enviar uno por uno con «Enviar paso».</li>
            </Box>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={realBusy} sx={{ textTransform: 'none' }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="primary"
            disabled={realBusy || dueCount === 0}
            startIcon={realBusy ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
            onClick={() => void handleRealRun()}
            sx={{ textTransform: 'none' }}
          >
            Enviar a {dueCount} contacto{dueCount === 1 ? '' : 's'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(suspendRow)}
        onClose={() => suspendLoadingId === null && setSuspendRow(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Suspender contacto</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            Vas a suspender a <strong>{suspendRow?.recipientName}</strong>
            {suspendRow?.phone ? ` (${suspendRow.phone})` : ''}.
            <Box component="ul" sx={{ mt: 1.5, pl: 2.5, mb: 0 }}>
              <li>Se marca <strong>opt-out (no contactar)</strong> en el directorio.</li>
              <li>Sale de la secuencia de reactivación y no recibirá más mensajes automáticos.</li>
              <li>Reversible: puedes quitar el opt-out desde la ficha del contacto.</li>
            </Box>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setSuspendRow(null)}
            disabled={suspendLoadingId !== null}
            sx={{ textTransform: 'none' }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={suspendLoadingId !== null}
            startIcon={
              suspendLoadingId !== null ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <BlockIcon />
              )
            }
            onClick={() => suspendRow && void handleSuspend(suspendRow)}
            sx={{ textTransform: 'none' }}
          >
            Suspender
          </Button>
        </DialogActions>
      </Dialog>

      <ReactivationDetailDialog
        row={detailRow}
        open={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        onRetrySuccess={() => {
          void queryClient.invalidateQueries({ queryKey: REACTIVATION_AUTOMATIONS_QUERY_KEY });
        }}
        onSuspendSuccess={() => {
          void queryClient.invalidateQueries({ queryKey: REACTIVATION_AUTOMATIONS_QUERY_KEY });
        }}
      />
    </Box>
  );
};

export default ReactivationPanel;
