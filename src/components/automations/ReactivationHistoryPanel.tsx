import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { useReactivationHistory } from '@/hooks/useReactivationHistory';
import {
  REACTIVATION_OUTCOME_COLOR,
  REACTIVATION_OUTCOME_LABEL,
  formatReactivationDate,
  formatReactivationRunKind,
  type ReactivationHistoryEvent,
  type ReactivationHistoryRun,
} from '@/types/reactivationAutomations';
import {
  defaultHistoryDateRange,
  formatRunDateTitle,
  formatRunTime,
  getDayHealth,
  groupRunsByDate,
  shiftIsoDate,
  toIsoDate,
} from '@/utils/reactivationHistoryFormat';

type RangePreset = '7d' | '14d' | '30d' | 'custom';

function rangeForPreset(preset: Exclude<RangePreset, 'custom'>): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  const days = preset === '7d' ? 6 : preset === '14d' ? 13 : 29;
  from.setDate(from.getDate() - days);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

function DayStatusIcon({ status }: { status: ReturnType<typeof getDayHealth>['status'] }) {
  const sx = { fontSize: 20 };
  if (status === 'ok') return <CheckCircleOutlineIcon color="success" sx={sx} />;
  if (status === 'partial') return <WarningAmberIcon color="warning" sx={sx} />;
  if (status === 'failed') return <ErrorOutlineIcon color="error" sx={sx} />;
  if (status === 'dry') return <ScienceOutlinedIcon color="info" sx={sx} />;
  return <ScheduleIcon color="disabled" sx={sx} />;
}

function dayStatusColor(status: ReturnType<typeof getDayHealth>['status']): string {
  if (status === 'ok') return 'success.main';
  if (status === 'partial') return 'warning.main';
  if (status === 'failed') return 'error.main';
  if (status === 'dry') return 'info.main';
  return 'text.disabled';
}

const ReactivationHistoryPanel: React.FC = () => {
  const defaults = defaultHistoryDateRange();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [preset, setPreset] = useState<RangePreset>('7d');
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useReactivationHistory({
    dateFrom,
    dateTo,
  });

  const runs = data?.runs ?? [];
  const dayGroups = useMemo(() => groupRunsByDate(runs), [runs]);

  const applyPreset = (next: RangePreset) => {
    setPreset(next);
    if (next === 'custom') return;
    const range = rangeForPreset(next);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const loadOlderWeek = () => {
    setPreset('custom');
    setDateFrom((prev) => shiftIsoDate(prev, -7));
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card variant="outlined" sx={{ borderRadius: 2 }}>
        <CardContent sx={{ '&:last-child': { pb: 2.5 } }}>
          <Stack direction="row" alignItems="flex-start" spacing={1.5} sx={{ mb: 1 }}>
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 1.5,
                display: 'grid',
                placeItems: 'center',
                bgcolor: 'rgba(0, 36, 70, 0.06)',
                color: 'primary.main',
                flexShrink: 0,
              }}
            >
              <HistoryIcon fontSize="small" />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'primary.main' }}>
                Historial de reactivaciones
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Corridas del envío de las 12:00 p. m., reintentos cada 30 min y envíos manuales.
                Los resultados «Simulación (no envió)» son dry-runs: no generan WhatsApp.
              </Typography>
            </Box>
          </Stack>

          <Stack spacing={1.5} sx={{ mt: 2, mb: 2 }}>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={preset === 'custom' ? null : preset}
              onChange={(_, value: RangePreset | null) => {
                if (value) applyPreset(value);
              }}
              sx={{
                flexWrap: 'wrap',
                gap: 0.5,
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  px: 1.5,
                  borderRadius: '8px !important',
                  border: '1px solid',
                  borderColor: 'divider !important',
                  ml: '0 !important',
                },
              }}
            >
              <ToggleButton value="7d">Últimos 7 días</ToggleButton>
              <ToggleButton value="14d">Últimas 2 semanas</ToggleButton>
              <ToggleButton value="30d">Último mes</ToggleButton>
            </ToggleButtonGroup>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
              <TextField
                label="Desde"
                type="date"
                size="small"
                value={dateFrom}
                onChange={(e) => {
                  setPreset('custom');
                  setDateFrom(e.target.value);
                }}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="Hasta"
                type="date"
                size="small"
                value={dateTo}
                onChange={(e) => {
                  setPreset('custom');
                  setDateTo(e.target.value);
                }}
                InputLabelProps={{ shrink: true }}
              />
              <Button
                variant="outlined"
                size="small"
                onClick={() => void refetch()}
                disabled={isFetching}
                sx={{ textTransform: 'none', alignSelf: { sm: 'center' }, minWidth: 96 }}
              >
                {isFetching ? <CircularProgress size={16} /> : 'Actualizar'}
              </Button>
            </Stack>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error.message}
            </Alert>
          )}

          {isLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 6 }}>
              <CircularProgress size={28} />
              <Typography variant="body2" color="text.secondary">
                Cargando historial…
              </Typography>
            </Box>
          ) : dayGroups.length === 0 ? (
            <Box
              sx={{
                py: 5,
                px: 2,
                textAlign: 'center',
                borderRadius: 2,
                border: '1px dashed',
                borderColor: 'divider',
                bgcolor: 'action.hover',
              }}
            >
              <Typography variant="body1" fontWeight={600} gutterBottom>
                No hay corridas en este periodo
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Prueba ampliar el rango o cargar una semana anterior.
              </Typography>
              <Button variant="contained" size="small" onClick={loadOlderWeek} sx={{ textTransform: 'none' }}>
                Cargar 7 días anteriores
              </Button>
            </Box>
          ) : (
            <Stack spacing={1.75}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {dayGroups.length} {dayGroups.length === 1 ? 'día' : 'días'} · {runs.length}{' '}
                {runs.length === 1 ? 'corrida' : 'corridas'}
              </Typography>

              {dayGroups.map((group) => {
                const health = getDayHealth(group.runsAsc);
                const dayOpen = expandedDay === group.runDate;
                return (
                  <Box
                    key={group.runDate}
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      overflow: 'hidden',
                      bgcolor: 'background.paper',
                    }}
                  >
                    <Box
                      role="button"
                      tabIndex={0}
                      aria-expanded={dayOpen}
                      onClick={() => setExpandedDay(dayOpen ? null : group.runDate)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedDay(dayOpen ? null : group.runDate);
                        }
                      }}
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 2,
                        px: 2.5,
                        py: 2,
                        cursor: 'pointer',
                        borderLeft: '4px solid',
                        borderLeftColor: dayStatusColor(health.status),
                        bgcolor: dayOpen ? 'action.hover' : 'transparent',
                      }}
                    >
                      <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
                          <DayStatusIcon status={health.status} />
                          <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'primary.main' }}>
                            {formatRunDateTitle(group.runDate)}
                          </Typography>
                          <Chip
                            size="small"
                            label={health.statusLabel}
                            color={
                              health.status === 'ok'
                                ? 'success'
                                : health.status === 'partial'
                                  ? 'warning'
                                  : health.status === 'failed'
                                    ? 'error'
                                    : health.status === 'dry'
                                      ? 'info'
                                      : 'default'
                            }
                            variant="outlined"
                          />
                        </Stack>
                        <Stack direction="row" flexWrap="wrap" gap={0.75}>
                          <Chip size="small" color="success" variant="outlined" label={`${health.sent} enviados`} />
                          <Chip size="small" color="error" variant="outlined" label={`${health.failed} fallidos`} />
                          {health.dryRun > 0 && (
                            <Chip
                              size="small"
                              color="info"
                              variant="outlined"
                              label={`${health.dryRun} simulados`}
                            />
                          )}
                          {health.skipped > 0 && (
                            <Chip size="small" variant="outlined" label={`${health.skipped} omitidos`} />
                          )}
                        </Stack>
                      </Stack>
                      <Box sx={{ color: 'text.secondary', pt: 0.5 }}>
                        {dayOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </Box>
                    </Box>

                    <Collapse in={dayOpen}>
                      <Box sx={{ px: 2.5, pb: 2.5, pt: 0.5 }}>
                        <Stack spacing={1.25}>
                          {group.runsAsc.map((run) => (
                            <RunCard
                              key={run.id}
                              run={run}
                              events={data?.eventsByRun[run.id] ?? []}
                              expanded={expandedRunId === run.id}
                              onToggle={() =>
                                setExpandedRunId(expandedRunId === run.id ? null : run.id)
                              }
                            />
                          ))}
                        </Stack>
                      </Box>
                    </Collapse>
                  </Box>
                );
              })}

              <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1 }}>
                <Button
                  variant="outlined"
                  onClick={loadOlderWeek}
                  disabled={isFetching}
                  sx={{ textTransform: 'none' }}
                >
                  Cargar 7 días anteriores
                </Button>
              </Box>
            </Stack>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

function RunCard({
  run,
  events,
  expanded,
  onToggle,
}: {
  run: ReactivationHistoryRun;
  events: ReactivationHistoryEvent[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const stats = run.execution_stats;
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: expanded ? 'primary.light' : 'divider',
        borderRadius: 1.5,
        overflow: 'hidden',
      }}
    >
      <Box
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1.5,
          px: 2,
          py: 1.5,
          cursor: 'pointer',
          borderLeft: '3px solid',
          borderLeftColor: run.dry_run
            ? 'info.main'
            : run.run_kind === 'manual'
              ? 'secondary.main'
              : run.run_kind === 'retry'
                ? 'warning.main'
                : 'primary.main',
        }}
      >
        <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="baseline" spacing={1} flexWrap="wrap" useFlexGap>
            <Typography variant="body2" fontWeight={700}>
              {formatReactivationRunKind(run.run_kind)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatRunTime(run.run_at)}
            </Typography>
            {run.dry_run && (
              <Chip size="small" color="info" label="dry-run" sx={{ height: 20 }} />
            )}
          </Stack>
          <Stack direction="row" flexWrap="wrap" gap={0.5}>
            <Chip size="small" color="success" variant="outlined" label={`${stats.sent ?? 0} enviados`} />
            <Chip size="small" color="error" variant="outlined" label={`${stats.failed ?? 0} fallidos`} />
            {(stats.dryRun ?? 0) > 0 && (
              <Chip size="small" color="info" variant="outlined" label={`${stats.dryRun} simulados`} />
            )}
            {(stats.skipped ?? 0) > 0 && (
              <Chip size="small" variant="outlined" label={`${stats.skipped} omitidos`} />
            )}
          </Stack>
        </Stack>
        <Box sx={{ color: 'text.secondary', pt: 0.25 }}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </Box>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>
          {events.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Sin eventos en esta corrida.
            </Typography>
          ) : (
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
                  {events.slice(0, 100).map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{event.recipient_name || '—'}</TableCell>
                      <TableCell>{event.step_number}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {event.template_name}
                      </TableCell>
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
          )}
        </Box>
      </Collapse>
    </Box>
  );
}

export default ReactivationHistoryPanel;
