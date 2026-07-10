import React, { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Collapse,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ScheduleIcon from '@mui/icons-material/Schedule';
import type { HistoryBatchEvent, HistoryBatchRun, ReminderRow } from '@/types/reminderAutomations';
import { formatExecutionStatsNarrative } from '@/types/reminderAutomations';
import ReminderTrackingTable from './ReminderTrackingTable';
import ReminderRunEventsTable from './ReminderRunEventsTable';
import {
  formatFriendlyDelta,
  formatRunTime,
  formatServiceDateTitle,
  getDayHealth,
  getSkipBreakdown,
  runKindSubtitle,
  runKindTitle,
  totalSkipped,
} from '@/utils/reminderHistoryFormat';

type RunDetailTab = 'execution' | 'snapshot';

export interface ReminderHistoryDayCardProps {
  serviceDate: string;
  runsAsc: HistoryBatchRun[];
  eventsByRun: Record<string, HistoryBatchEvent[]>;
  rowsByRun: Map<string, ReminderRow[]>;
  showRecipientType: boolean;
  defaultExpanded?: boolean;
  onViewDetail: (row: ReminderRow) => void;
}

function dayStatusColor(status: ReturnType<typeof getDayHealth>['status']): string {
  if (status === 'ok') return 'success.main';
  if (status === 'partial') return 'warning.main';
  if (status === 'failed') return 'error.main';
  return 'text.disabled';
}

function DayStatusIcon({ status }: { status: ReturnType<typeof getDayHealth>['status'] }) {
  const sx = { fontSize: 20 };
  if (status === 'ok') return <CheckCircleOutlineIcon color="success" sx={sx} />;
  if (status === 'partial') return <WarningAmberIcon color="warning" sx={sx} />;
  if (status === 'failed') return <ErrorOutlineIcon color="error" sx={sx} />;
  return <ScheduleIcon color="disabled" sx={sx} />;
}

const ReminderHistoryDayCard: React.FC<ReminderHistoryDayCardProps> = ({
  serviceDate,
  runsAsc,
  eventsByRun,
  rowsByRun,
  showRecipientType,
  defaultExpanded = false,
  onViewDetail,
}) => {
  const [dayOpen, setDayOpen] = useState(defaultExpanded);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runTabById, setRunTabById] = useState<Record<string, RunDetailTab>>({});

  const health = useMemo(() => getDayHealth(runsAsc), [runsAsc]);
  const runCount = runsAsc.length;
  const primaryCount = runsAsc.filter((r) => r.runKind === 'primary').length;
  const retryCount = runsAsc.filter((r) => r.runKind === 'retry').length;

  const getRunTab = (runId: string): RunDetailTab => runTabById[runId] ?? 'execution';

  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        bgcolor: 'background.paper',
        transition: 'box-shadow 0.2s ease',
        '&:hover': { boxShadow: '0 2px 12px rgba(0, 36, 70, 0.06)' },
      }}
    >
      <Box
        role="button"
        tabIndex={0}
        aria-expanded={dayOpen}
        onClick={() => setDayOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setDayOpen((v) => !v);
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
          transition: 'background-color 0.15s ease',
        }}
      >
        <Stack spacing={1} sx={{ minWidth: 0, flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
            <DayStatusIcon status={health.status} />
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: 'primary.main', lineHeight: 1.3 }}>
              Citas del {formatServiceDateTitle(serviceDate)}
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
                      : 'default'
              }
              variant="outlined"
              sx={{ height: 22, fontWeight: 600 }}
            />
          </Stack>

          <Typography variant="body2" color="text.secondary">
            Resultado final tras {runCount} {runCount === 1 ? 'corrida' : 'corridas'}
            {primaryCount > 0 ? ` · ${primaryCount} principal` : ''}
            {retryCount > 0 ? ` · ${retryCount} ${retryCount === 1 ? 'reintento' : 'reintentos'}` : ''}
          </Typography>

          <Stack direction="row" flexWrap="wrap" gap={0.75}>
            <Chip
              size="small"
              color="success"
              variant="filled"
              label={`${health.sent} enviados`}
              sx={{ fontWeight: 600 }}
            />
            {health.failed > 0 && (
              <Chip
                size="small"
                color="error"
                variant="filled"
                label={`${health.failed} fallidos`}
                sx={{ fontWeight: 600 }}
              />
            )}
            {health.skipped > 0 && (
              <Tooltip title="Omitidos: ya enviados, sin teléfono, desactivados, etc.">
                <Chip
                  size="small"
                  color="default"
                  variant="outlined"
                  label={`${health.skipped} omitidos`}
                />
              </Tooltip>
            )}
          </Stack>
        </Stack>

        <Box sx={{ color: 'text.secondary', pt: 0.5 }}>
          {dayOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </Box>
      </Box>

      <Collapse in={dayOpen}>
        <Box sx={{ px: 2.5, pb: 2.5, pt: 0.5 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mb: 1.5, letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: 600 }}
          >
            Corridas de ese día
          </Typography>

          <Stack spacing={1.25}>
            {runsAsc.map((run, index) => {
              const expanded = expandedRunId === run.id;
              const events = eventsByRun[run.id] ?? [];
              const rows = rowsByRun.get(run.id) ?? [];
              const prev = index > 0 ? runsAsc[index - 1] : undefined;
              const delta = formatFriendlyDelta(prev, run);
              const skips = getSkipBreakdown(run.executionStats);
              const runTab = getRunTab(run.id);
              const isPrimary = run.runKind === 'primary';
              const skipped = totalSkipped(run.executionStats);

              return (
                <Box
                  key={run.id}
                  sx={{
                    border: '1px solid',
                    borderColor: expanded ? 'primary.light' : 'divider',
                    borderRadius: 1.5,
                    bgcolor: isPrimary ? 'rgba(0, 36, 70, 0.02)' : 'background.default',
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={() => setExpandedRunId(expanded ? null : run.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setExpandedRunId(expanded ? null : run.id);
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
                      borderLeftColor: isPrimary
                        ? 'primary.main'
                        : run.runKind === 'manual'
                          ? 'secondary.main'
                          : 'info.main',
                    }}
                  >
                    <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" alignItems="baseline" spacing={1} flexWrap="wrap" useFlexGap>
                        <Typography variant="body2" fontWeight={700}>
                          {runKindTitle(run.runKind)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatRunTime(run.runAt)}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                          Intento {index + 1} de {runCount}
                        </Typography>
                      </Stack>

                      <Typography variant="caption" color="text.secondary" display="block">
                        {runKindSubtitle(run.runKind)}
                        {events.length > 0
                          ? ` · ${formatExecutionStatsNarrative(run.executionStats)}`
                          : ''}
                      </Typography>

                      <Stack direction="row" flexWrap="wrap" gap={0.5}>
                        <Chip
                          size="small"
                          color="success"
                          variant="outlined"
                          label={`${run.executionStats.sent} enviados`}
                          sx={{ height: 22 }}
                        />
                        {run.executionStats.failed > 0 && (
                          <Chip
                            size="small"
                            color="error"
                            variant="outlined"
                            label={`${run.executionStats.failed} fallidos`}
                            sx={{ height: 22 }}
                          />
                        )}
                        {skipped > 0 && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`${skipped} omitidos`}
                            sx={{ height: 22 }}
                          />
                        )}
                        {delta && (
                          <Tooltip title="Comparado con la corrida anterior del mismo día de citas">
                            <Chip
                              size="small"
                              color="info"
                              variant="outlined"
                              label={delta}
                              sx={{ height: 22, maxWidth: '100%' }}
                            />
                          </Tooltip>
                        )}
                      </Stack>
                    </Stack>

                    <Box sx={{ color: 'text.secondary', pt: 0.25 }}>
                      {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                    </Box>
                  </Box>

                  <Collapse in={expanded}>
                    <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>
                      {skips.length > 0 && (
                        <Box
                          sx={{
                            mb: 2,
                            p: 1.5,
                            borderRadius: 1,
                            bgcolor: 'action.hover',
                            border: '1px dashed',
                            borderColor: 'divider',
                          }}
                        >
                          <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" sx={{ mb: 1 }}>
                            Desglose de omitidos
                          </Typography>
                          <Stack direction="row" flexWrap="wrap" gap={0.75}>
                            {skips.map((item) => (
                              <Tooltip key={item.key} title={item.hint}>
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={`${item.label}: ${item.count}`}
                                  sx={{ height: 24 }}
                                />
                              </Tooltip>
                            ))}
                          </Stack>
                        </Box>
                      )}

                      <Tabs
                        value={runTab}
                        onChange={(_, value: RunDetailTab) =>
                          setRunTabById((prevTabs) => ({ ...prevTabs, [run.id]: value }))
                        }
                        sx={{ mb: 1.5, minHeight: 36, '& .MuiTab-root': { minHeight: 36 } }}
                      >
                        <Tab
                          label="Qué pasó en esta corrida"
                          value="execution"
                          sx={{ textTransform: 'none', fontWeight: 600 }}
                        />
                        <Tab
                          label="Estado final de las citas"
                          value="snapshot"
                          sx={{ textTransform: 'none', fontWeight: 600 }}
                        />
                      </Tabs>

                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                        {runTab === 'execution'
                          ? 'Lista de cada mensaje: enviados, fallidos u omitidos en este intento.'
                          : 'Foto completa de todas las citas al cerrar esta corrida (incluye las que no se tocaron).'}
                      </Typography>

                      {runTab === 'execution' ? (
                        <ReminderRunEventsTable
                          events={events}
                          showRecipientType={showRecipientType}
                        />
                      ) : (
                        <ReminderTrackingTable
                          rows={rows}
                          onViewDetail={onViewDetail}
                          readOnly
                        />
                      )}
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
};

export default ReminderHistoryDayCard;
