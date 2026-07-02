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
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useReminderHistory } from '@/hooks/useReminderHistory';
import type { HistoryBatchRun, ReminderRecipientType, ReminderRow } from '@/types/reminderAutomations';
import {
  formatExecutionStatsNarrative,
  historyItemToReminderRow,
  REMINDER_STATUS_LABEL,
} from '@/types/reminderAutomations';
import ReminderTrackingTable from './ReminderTrackingTable';
import ReminderRunEventsTable from './ReminderRunEventsTable';
import ReminderMessageDetailDialog from './ReminderMessageDetailDialog';

function defaultDateRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function formatRunAt(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

function runKindLabel(kind: HistoryBatchRun['runKind']): string {
  if (kind === 'primary') return 'Principal (6 PM)';
  if (kind === 'manual') return 'Manual';
  return 'Reintento';
}

type RunDetailTab = 'execution' | 'snapshot';

const ReminderHistoryPanel: React.FC = () => {
  const defaults = defaultDateRange();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [recipientFilter, setRecipientFilter] = useState<'all' | ReminderRecipientType>('all');
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [runTabById, setRunTabById] = useState<Record<string, RunDetailTab>>({});
  const [detailRow, setDetailRow] = useState<ReminderRow | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useReminderHistory({
    dateFrom,
    dateTo,
    recipientType: recipientFilter === 'all' ? undefined : recipientFilter,
  });

  const runs = data?.runs ?? [];

  const runsByServiceDate = useMemo(() => {
    const map = new Map<string, HistoryBatchRun[]>();
    for (const run of [...runs].sort((a, b) => a.runAt.localeCompare(b.runAt))) {
      const list = map.get(run.serviceDate) ?? [];
      list.push(run);
      map.set(run.serviceDate, list);
    }
    return map;
  }, [runs]);

  const rowsByRun = useMemo(() => {
    const map = new Map<string, ReminderRow[]>();
    if (!data) return map;
    for (const run of runs) {
      const items = data.itemsByRun[run.id] ?? [];
      map.set(
        run.id,
        items.map(historyItemToReminderRow),
      );
    }
    return map;
  }, [data, runs]);

  const getRunSequenceLabel = (run: HistoryBatchRun): string => {
    const serviceRuns = runsByServiceDate.get(run.serviceDate) ?? [];
    const index = serviceRuns.findIndex((r) => r.id === run.id);
    const total = serviceRuns.length;
    if (index < 0 || total === 0) return `servicio ${run.serviceDate}`;
    return `Ejecución ${index + 1} de ${total} · servicio ${run.serviceDate}`;
  };

  const getRunTab = (runId: string): RunDetailTab => runTabById[runId] ?? 'execution';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" fontWeight={700} gutterBottom>
            Historial de ejecuciones
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Cada ejecución registra qué envió, falló u omitió; el tab Estado al cierre muestra el
            corte global de citas.
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
            <TextField
              label="Desde"
              type="date"
              size="small"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Hasta"
              type="date"
              size="small"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="history-recipient-filter">Destinatario</InputLabel>
              <Select
                labelId="history-recipient-filter"
                label="Destinatario"
                value={recipientFilter}
                onChange={(e) => setRecipientFilter(e.target.value as 'all' | ReminderRecipientType)}
              >
                <MenuItem value="all">Todos</MenuItem>
                <MenuItem value="client">Clientes</MenuItem>
                <MenuItem value="professional">Cleaners</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              size="small"
              onClick={() => void refetch()}
              disabled={isFetching}
              sx={{ textTransform: 'none', alignSelf: { sm: 'center' } }}
            >
              {isFetching ? <CircularProgress size={16} /> : 'Buscar'}
            </Button>
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error.message}
            </Alert>
          )}

          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : runs.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              Sin ejecuciones en el rango seleccionado.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {runs.map((run) => {
                const expanded = expandedRunId === run.id;
                const rows = rowsByRun.get(run.id) ?? [];
                const events = data?.eventsByRun[run.id] ?? [];
                const delta = data?.deltasByRunId[run.id];
                const runTab = getRunTab(run.id);
                const narrative = formatExecutionStatsNarrative(run.executionStats);
                const hasEvents = events.length > 0;

                const summaryFromRows = rows.reduce<Record<string, number>>((acc, row) => {
                  acc[row.deliveryStatus] = (acc[row.deliveryStatus] ?? 0) + 1;
                  return acc;
                }, {});
                const summaryEntries = Object.entries(
                  runTab === 'snapshot' && rows.length > 0 ? summaryFromRows : run.summary,
                ).filter(([, count]) => count > 0);

                return (
                  <Card key={run.id} variant="outlined" sx={{ bgcolor: 'action.hover' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1,
                          cursor: 'pointer',
                        }}
                        onClick={() => setExpandedRunId(expanded ? null : run.id)}
                      >
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {formatRunAt(run.runAt)} · {runKindLabel(run.runKind)} ·{' '}
                            {getRunSequenceLabel(run)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {run.schedulerName}
                            {hasEvents ? ` · En esta ejecución: ${narrative}` : ''}
                          </Typography>
                        </Box>
                        {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </Box>

                      <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 1 }}>
                        {delta && (
                          <Chip size="small" color="info" variant="outlined" label={delta} />
                        )}
                        {summaryEntries.map(([status, count]) => (
                          <Chip
                            key={status}
                            size="small"
                            variant="outlined"
                            label={`${REMINDER_STATUS_LABEL[status as keyof typeof REMINDER_STATUS_LABEL] ?? status}: ${count}`}
                          />
                        ))}
                      </Stack>

                      <Collapse in={expanded}>
                        <Box sx={{ mt: 2 }}>
                          <Tabs
                            value={runTab}
                            onChange={(_, value: RunDetailTab) =>
                              setRunTabById((prev) => ({ ...prev, [run.id]: value }))
                            }
                            sx={{ mb: 2, minHeight: 36, '& .MuiTab-root': { minHeight: 36 } }}
                          >
                            <Tab
                              label="Esta ejecución"
                              value="execution"
                              sx={{ textTransform: 'none' }}
                            />
                            <Tab
                              label="Estado al cierre"
                              value="snapshot"
                              sx={{ textTransform: 'none' }}
                            />
                          </Tabs>

                          {runTab === 'execution' ? (
                            <ReminderRunEventsTable
                              events={events}
                              showRecipientType={recipientFilter === 'all'}
                            />
                          ) : (
                            <ReminderTrackingTable
                              rows={rows}
                              onViewDetail={setDetailRow}
                              readOnly
                            />
                          )}
                        </Box>
                      </Collapse>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          )}
        </CardContent>
      </Card>

      <ReminderMessageDetailDialog
        row={detailRow}
        open={Boolean(detailRow)}
        onClose={() => setDetailRow(null)}
        hideRetry
      />
    </Box>
  );
};

export default ReminderHistoryPanel;
