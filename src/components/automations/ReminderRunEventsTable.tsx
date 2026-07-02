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
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        Sin detalle de ejecución (snapshot legacy).
      </Typography>
    );
  }

  const recipientLabel = (type: ReminderRecipientType) =>
    type === 'client' ? 'Cliente' : 'Cleaner';

  return (
    <Box>
      <Tabs
        value={filter}
        onChange={(_, value: EventFilter) => setFilter(value)}
        sx={{ mb: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
      >
        <Tab label="Todos" value="all" sx={{ textTransform: 'none' }} />
        <Tab label="Enviados" value="sent" sx={{ textTransform: 'none' }} />
        <Tab label="Fallidos" value="failed" sx={{ textTransform: 'none' }} />
        <Tab label="Omitidos" value="skipped" sx={{ textTransform: 'none' }} />
      </Tabs>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Cita</TableCell>
              {showRecipientType && <TableCell>Tipo</TableCell>}
              <TableCell>Resultado</TableCell>
              <TableCell>Error</TableCell>
              <TableCell>WA ID</TableCell>
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
                  <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 200, display: 'block' }}>
                    {event.errorMessage ?? '—'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {event.waMessageId ?? '—'}
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
            Sin filas para este filtro.
          </Typography>
        </Stack>
      )}
    </Box>
  );
};

export default ReminderRunEventsTable;
