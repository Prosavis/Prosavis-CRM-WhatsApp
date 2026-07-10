import React, { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { HistoryBatchEvent, ReminderRecipientType } from '@/types/reminderAutomations';
import {
  BATCH_EVENT_OUTCOME_COLOR,
  BATCH_EVENT_OUTCOME_LABEL,
} from '@/types/reminderAutomations';

type EventFilter = 'all' | 'sent' | 'failed' | 'skipped';

export interface ReminderRunEventsTableProps {
  events: HistoryBatchEvent[];
  showRecipientType?: boolean;
}

function matchesFilter(outcome: HistoryBatchEvent['outcome'], filter: EventFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'sent') return outcome === 'sent';
  if (filter === 'failed') return outcome === 'failed';
  return outcome.startsWith('skipped_');
}

const ReminderRunEventsTable: React.FC<ReminderRunEventsTableProps> = ({
  events,
  showRecipientType = true,
}) => {
  const [filter, setFilter] = useState<EventFilter>('all');

  const filtered = useMemo(
    () => events.filter((event) => matchesFilter(event.outcome, filter)),
    [events, filter],
  );

  if (events.length === 0) {
    return (
      <Box
        sx={{
          py: 3,
          px: 2,
          textAlign: 'center',
          borderRadius: 1.5,
          border: '1px dashed',
          borderColor: 'divider',
          bgcolor: 'action.hover',
        }}
      >
        <Typography variant="body2" fontWeight={600} gutterBottom>
          Sin detalle por mensaje
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Esta corrida es anterior al registro detallado. Revisa la pestaña de estado final para ver
          el corte de citas.
        </Typography>
      </Box>
    );
  }

  const recipientLabel = (type: ReminderRecipientType) =>
    type === 'client' ? 'Cliente' : 'Cleaner';

  const sentCount = events.filter((e) => e.outcome === 'sent').length;
  const failedCount = events.filter((e) => e.outcome === 'failed').length;
  const skippedCount = events.filter((e) => e.outcome.startsWith('skipped_')).length;

  return (
    <Box>
      <Tabs
        value={filter}
        onChange={(_, value: EventFilter) => setFilter(value)}
        sx={{ mb: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
      >
        <Tab label={`Todos (${events.length})`} value="all" sx={{ textTransform: 'none' }} />
        <Tab label={`Enviados (${sentCount})`} value="sent" sx={{ textTransform: 'none' }} />
        <Tab label={`Fallidos (${failedCount})`} value="failed" sx={{ textTransform: 'none' }} />
        <Tab label={`Omitidos (${skippedCount})`} value="skipped" sx={{ textTransform: 'none' }} />
      </Tabs>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Cita</TableCell>
              {showRecipientType && <TableCell>Para</TableCell>}
              <TableCell>Resultado</TableCell>
              <TableCell>Motivo</TableCell>
              <TableCell>Intento</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((event) => (
              <TableRow key={event.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {event.appointmentId}
                  </Typography>
                </TableCell>
                {showRecipientType && (
                  <TableCell>{recipientLabel(event.recipientType)}</TableCell>
                )}
                <TableCell>
                  <Chip
                    size="small"
                    color={BATCH_EVENT_OUTCOME_COLOR[event.outcome]}
                    label={BATCH_EVENT_OUTCOME_LABEL[event.outcome]}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 240, display: 'block' }}>
                    {event.errorMessage ?? (event.outcome === 'sent' ? 'Enviado correctamente' : '—')}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">
                    {event.attemptNumber != null ? `#${event.attemptNumber}` : '—'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {filtered.length === 0 && (
        <Stack alignItems="center" sx={{ py: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No hay mensajes en este filtro.
          </Typography>
        </Stack>
      )}
    </Box>
  );
};

export default ReminderRunEventsTable;
