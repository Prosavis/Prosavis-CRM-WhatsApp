import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import HistoryIcon from '@mui/icons-material/History';
import { useReminderHistory } from '@/hooks/useReminderHistory';
import type { ReminderRecipientType, ReminderRow } from '@/types/reminderAutomations';
import { historyItemToReminderRow } from '@/types/reminderAutomations';
import ReminderHistoryDayCard from './ReminderHistoryDayCard';
import ReminderMessageDetailDialog from './ReminderMessageDetailDialog';
import {
  defaultHistoryDateRange,
  groupRunsByServiceDate,
  shiftIsoDate,
  toIsoDate,
} from '@/utils/reminderHistoryFormat';

type RangePreset = '7d' | '14d' | '30d' | 'custom';

function rangeForPreset(preset: Exclude<RangePreset, 'custom'>): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  const days = preset === '7d' ? 6 : preset === '14d' ? 13 : 29;
  from.setDate(from.getDate() - days);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

const ReminderHistoryPanel: React.FC = () => {
  const defaults = defaultHistoryDateRange();
  const [dateFrom, setDateFrom] = useState(defaults.from);
  const [dateTo, setDateTo] = useState(defaults.to);
  const [preset, setPreset] = useState<RangePreset>('7d');
  const [recipientFilter, setRecipientFilter] = useState<'all' | ReminderRecipientType>('all');
  const [detailRow, setDetailRow] = useState<ReminderRow | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useReminderHistory({
    dateFrom,
    dateTo,
    recipientType: recipientFilter === 'all' ? undefined : recipientFilter,
  });

  const runs = data?.runs ?? [];

  const dayGroups = useMemo(() => groupRunsByServiceDate(runs), [runs]);

  const rowsByRun = useMemo(() => {
    const map = new Map<string, ReminderRow[]>();
    if (!data) return map;
    for (const run of runs) {
      const items = data.itemsByRun[run.id] ?? [];
      map.set(run.id, items.map(historyItemToReminderRow));
    }
    return map;
  }, [data, runs]);

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
                Historial de recordatorios
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Organizado por día de citas. Abre un día para ver el envío de las 6:00 p. m. y los
                reintentos, con el desglose de enviados, fallidos y omitidos.
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
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="history-recipient-filter">Destinatario</InputLabel>
                <Select
                  labelId="history-recipient-filter"
                  label="Destinatario"
                  value={recipientFilter}
                  onChange={(e) =>
                    setRecipientFilter(e.target.value as 'all' | ReminderRecipientType)
                  }
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
                Prueba ampliar el rango o cargar una semana anterior. El historial se conserva en la
                base de datos desde que se activó el monitoreo.
              </Typography>
              <Button variant="contained" size="small" onClick={loadOlderWeek} sx={{ textTransform: 'none' }}>
                Cargar 7 días anteriores
              </Button>
            </Box>
          ) : (
            <Stack spacing={1.75}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                {dayGroups.length} {dayGroups.length === 1 ? 'día' : 'días'} de citas · {runs.length}{' '}
                {runs.length === 1 ? 'corrida' : 'corridas'}
              </Typography>

              {dayGroups.map((group) => (
                <ReminderHistoryDayCard
                  key={group.serviceDate}
                  serviceDate={group.serviceDate}
                  runsAsc={group.runsAsc}
                  eventsByRun={data?.eventsByRun ?? {}}
                  rowsByRun={rowsByRun}
                  showRecipientType={recipientFilter === 'all'}
                  defaultExpanded={false}
                  onViewDetail={setDetailRow}
                />
              ))}

              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1.5,
                  pt: 1,
                }}
              >
                <Button
                  variant="outlined"
                  onClick={loadOlderWeek}
                  disabled={isFetching}
                  sx={{ textTransform: 'none' }}
                >
                  Cargar 7 días anteriores
                </Button>
                <Typography variant="caption" color="text.secondary">
                  Desde {dateFrom} hasta {dateTo}
                </Typography>
              </Box>
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
