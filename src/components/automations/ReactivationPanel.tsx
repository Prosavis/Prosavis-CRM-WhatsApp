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
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import { useQueryClient } from '@tanstack/react-query';
import { useReactivationAutomationsDashboard, REACTIVATION_AUTOMATIONS_QUERY_KEY } from '@/hooks/useReactivationAutomationsDashboard';
import {
  runReactivationDryRun,
  setRecipientReactivationPreference,
  retryReactivationStep,
} from '@/services/reactivationAutomationsService';
import {
  REACTIVATION_STATUS_COLOR,
  REACTIVATION_STATUS_LABEL,
  formatReactivationDate,
  type ReactivationDashboardRow,
} from '@/types/reactivationAutomations';

function formatDay(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const ReactivationPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, error, refetch } = useReactivationAutomationsDashboard();
  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);
  const [retryLoadingId, setRetryLoadingId] = useState<string | null>(null);
  const [dryRunBusy, setDryRunBusy] = useState(false);
  const [dryRunMsg, setDryRunMsg] = useState<string | null>(null);

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
      await queryClient.invalidateQueries({ queryKey: REACTIVATION_AUTOMATIONS_QUERY_KEY });
    } catch (err) {
      setDryRunMsg(err instanceof Error ? err.message : 'Error al reintentar');
    } finally {
      setRetryLoadingId(null);
    }
  };

  const handleDryRun = async () => {
    setDryRunBusy(true);
    setDryRunMsg(null);
    try {
      const result = await runReactivationDryRun(25);
      setDryRunMsg(
        `Dry-run OK · due=${result.dueCount ?? 0} · sent(sim)=${result.stats?.dryRun ?? 0} · skipped=${result.stats?.skipped ?? 0}`,
      );
      await queryClient.invalidateQueries({ queryKey: REACTIVATION_AUTOMATIONS_QUERY_KEY });
    } catch (err) {
      setDryRunMsg(err instanceof Error ? err.message : 'Dry-run falló');
    } finally {
      setDryRunBusy(false);
    }
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
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        alignItems={{ sm: 'center' }}
        justifyContent="space-between"
      >
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Reactivaciones
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Cadencia 3 meses: semanal el mes 1, mensual los meses 2–3. Cron 10:00 America/Bogota.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            variant="outlined"
            startIcon={dryRunBusy ? <CircularProgress size={14} /> : <ScienceOutlinedIcon />}
            onClick={() => void handleDryRun()}
            disabled={dryRunBusy}
          >
            Dry-run
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={isFetching ? <CircularProgress size={14} /> : <RefreshIcon />}
            onClick={() => void refetch()}
          >
            Actualizar
          </Button>
        </Stack>
      </Stack>

      {error && (
        <Alert severity="error">
          <AlertTitle>Error al cargar</AlertTitle>
          {error.message}
        </Alert>
      )}

      {dryRunMsg && (
        <Alert severity={dryRunMsg.startsWith('Dry-run OK') ? 'success' : 'warning'} onClose={() => setDryRunMsg(null)}>
          {dryRunMsg}
        </Alert>
      )}

      {data && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={`Inscritos: ${data.summary.enrolled}`} color="primary" variant="outlined" />
          <Chip label={`Debidos hoy: ${data.summary.dueToday}`} color="warning" variant="outlined" />
          <Chip label={`Elegibles nuevos: ${data.summary.eligibleNew}`} color="info" variant="outlined" />
          <Chip label={`Enviados 7d: ${data.summary.sentLast7d}`} color="success" variant="outlined" />
          <Chip label={`Pausados: ${data.summary.pausedReply}`} variant="outlined" />
          <Chip label={`Reactivados 30d: ${data.summary.reactivatedApprox}`} color="success" />
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
              Pasos de cadencia
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {data.meta.steps.map((step) => (
                <Chip
                  key={step.step}
                  size="small"
                  label={`Día ${step.dayFromEnrollment}: ${step.label} · ${step.templateName}`}
                  variant="outlined"
                />
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Cola e inscritos ({rows.length})
          </Typography>
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
                  <TableCell align="center">Activo</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.slice(0, 200).map((row) => (
                  <TableRow key={row.directoryId} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {row.recipientName}
                      </Typography>
                      {row.isRecurring && (
                        <Chip size="small" label="Recurrente" sx={{ mt: 0.5 }} />
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
                      <Chip
                        size="small"
                        label={REACTIVATION_STATUS_LABEL[row.status]}
                        color={REACTIVATION_STATUS_COLOR[row.status]}
                      />
                    </TableCell>
                    <TableCell>{formatReactivationDate(row.lastContactAt)}</TableCell>
                    <TableCell align="center">
                      <Switch
                        size="small"
                        checked={row.reactivationsEnabled}
                        disabled={toggleLoadingId === row.directoryId}
                        onChange={(_, checked) => void handleToggle(row, checked)}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        disabled={
                          retryLoadingId === row.directoryId ||
                          row.status === 'opt_out' ||
                          !row.reactivationsEnabled
                        }
                        onClick={() => void handleRetry(row)}
                      >
                        {retryLoadingId === row.directoryId ? '…' : 'Enviar paso'}
                      </Button>
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

      {data && data.lastRunEvents.length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              Eventos del último run ({data.lastRunEvents.length})
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Nombre</TableCell>
                    <TableCell>Paso</TableCell>
                    <TableCell>Plantilla</TableCell>
                    <TableCell>Resultado</TableCell>
                    <TableCell>Cuándo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.lastRunEvents.slice(0, 50).map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{event.recipient_name || '—'}</TableCell>
                      <TableCell>{event.step_number}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {event.template_name}
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={event.outcome} variant="outlined" />
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
    </Box>
  );
};

export default ReactivationPanel;
