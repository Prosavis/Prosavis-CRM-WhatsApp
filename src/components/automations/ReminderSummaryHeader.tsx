import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import type {
  ReminderAutomationsDashboard,
  ReminderDeliveryStatus,
} from '@/types/reminderAutomations';
import { REMINDER_STATUS_COLOR, REMINDER_STATUS_LABEL } from '@/types/reminderAutomations';

const SUMMARY_ORDER: ReminderDeliveryStatus[] = [
  'ready',
  'pending',
  'sent',
  'failed',
  'sent_unverified',
  'missing_phone',
  'missing_professional',
  'skipped',
];

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

function useCountdown(targetIso: string | undefined, active: boolean): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!active || !targetIso) {
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
  }, [targetIso, active]);

  return label;
}

export interface ReminderSummaryHeaderProps {
  dashboard: ReminderAutomationsDashboard | undefined;
  loading: boolean;
  onRefresh: () => void;
}

const ReminderSummaryHeader: React.FC<ReminderSummaryHeaderProps> = ({
  dashboard,
  loading,
  onRefresh,
}) => {
  const meta = dashboard?.meta;
  const countdown = useCountdown(
    meta?.nextSchedulerRunAt,
    Boolean(meta?.beforeNextSchedulerRun),
  );

  return (
    <Box
      sx={{
        mb: 2,
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
              Recordatorios WhatsApp 24h
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Solo lectura — pipeline de las 6:00 PM (Colombia) para citas del día siguiente.
          </Typography>
          {meta && (
            <Stack spacing={0.25} sx={{ mt: 1 }}>
              <Typography variant="body2">
                Próxima ejecución: <strong>{formatSchedulerTime(meta.nextSchedulerRunAt)}</strong>
                {countdown ? ` · en ${countdown}` : null}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Última ejecución: {formatSchedulerTime(meta.lastSchedulerRunAt)} · Próximo envío
                (servicio {meta.upcomingServiceDate}) · Último batch (servicio{' '}
                {meta.lastRunServiceDate})
              </Typography>
            </Stack>
          )}
        </Box>

        <Button
          variant="outlined"
          size="small"
          startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
          onClick={onRefresh}
          disabled={loading}
          sx={{ textTransform: 'none', flexShrink: 0 }}
        >
          Refrescar
        </Button>
      </Stack>

      {dashboard?.summary && (
        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 2 }}>
          {SUMMARY_ORDER.map((status) => {
            const count = dashboard.summary[status] ?? 0;
            if (count === 0) return null;
            return (
              <Chip
                key={status}
                size="small"
                label={`${REMINDER_STATUS_LABEL[status]}: ${count}`}
                color={REMINDER_STATUS_COLOR[status]}
                variant="outlined"
              />
            );
          })}
        </Stack>
      )}
    </Box>
  );
};

export default ReminderSummaryHeader;
