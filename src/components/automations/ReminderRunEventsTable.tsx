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
  Tooltip,
  Typography,
} from '@mui/material';
import type {
  BatchEventDisplayOutcome,
  HistoryBatchEvent,
  ReminderRecipientType,
} from '@/types/reminderAutomations';
import {
  BATCH_EVENT_OUTCOME_COLOR,
  BATCH_EVENT_OUTCOME_LABEL,
} from '@/types/reminderAutomations';

type EventFilter = 'all' | 'delivered' | 'in_transit' | 'failed' | 'skipped';

export interface ReminderRunEventsTableProps {
  events: HistoryBatchEvent[];
  showRecipientType?: boolean;
}

function matchesFilter(displayOutcome: BatchEventDisplayOutcome, filter: EventFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'delivered') return displayOutcome === 'delivered' || displayOutcome === 'sent';
  if (filter === 'in_transit') return displayOutcome === 'in_transit';
  if (filter === 'failed') return displayOutcome === 'failed';
  return displayOutcome.startsWith('skipped_');
}

function shortAppointmentId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}

const ReminderRunEventsTable: React.FC<ReminderRunEventsTableProps> = ({
  events,
  showRecipientType = true,
}) => {
  const [filter, setFilter] = useState<EventFilter>('all');

  const filtered = useMemo(
    () => events.filter((event) => matchesFilter(event.displayOutcome, filter)),
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

  const deliveredCount = events.filter(
    (e) => e.displayOutcome === 'delivered' || e.displayOutcome === 'sent',
  ).length;
  const inTransitCount = events.filter((e) => e.displayOutcome === 'in_transit').length;
  const failedCount = events.filter((e) => e.displayOutcome === 'failed').length;
  const skippedCount = events.filter((e) => e.displayOutcome.startsWith('skipped_')).length;

  const counterpartName = (event: HistoryBatchEvent): string => {
    if (event.recipientType === 'client') {
      return event.professionalName?.trim() || '—';
    }
    return event.clientName?.trim() || '—';
  };

  const outcomeTooltip = (event: HistoryBatchEvent): string | undefined => {
    if (event.displayOutcome === 'delivered' && event.logStatus === 'read') {
      return 'Entregado y leído';
    }
    if (event.displayOutcome === 'delivered') return 'Entregado al teléfono';
    if (event.displayOutcome === 'in_transit') {
      return 'Meta aceptó el mensaje; pendiente de confirmación de entrega';
    }
    return event.errorMessage ?? undefined;
  };

  const motivoText = (event: HistoryBatchEvent): string => {
    if (event.errorMessage) return event.errorMessage;
    if (event.displayOutcome === 'delivered') {
      return event.logStatus === 'read' ? 'Entregado y leído' : 'Entregado al teléfono';
    }
    if (event.displayOutcome === 'in_transit') {
      return 'Aceptado por Meta; pendiente de entrega';
    }
    if (event.displayOutcome === 'sent') return 'Enviado correctamente';
    return '—';
  };

  return (
    <Box>
      <Tabs
        value={filter}
        onChange={(_, value: EventFilter) => setFilter(value)}
        sx={{ mb: 1, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
        variant="scrollable"
        scrollButtons="auto"
      >
        <Tab label={`Todos (${events.length})`} value="all" sx={{ textTransform: 'none' }} />
        <Tab
          label={`Entregados (${deliveredCount})`}
          value="delivered"
          sx={{ textTransform: 'none' }}
        />
        <Tab
          label={`En tránsito (${inTransitCount})`}
          value="in_transit"
          sx={{ textTransform: 'none' }}
        />
        <Tab label={`Fallidos (${failedCount})`} value="failed" sx={{ textTransform: 'none' }} />
        <Tab label={`Omitidos (${skippedCount})`} value="skipped" sx={{ textTransform: 'none' }} />
      </Tabs>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Destinatario</TableCell>
              <TableCell>
                {showRecipientType ? 'Cliente / Cleaner' : 'Contraparte'}
              </TableCell>
              <TableCell>Cita</TableCell>
              {showRecipientType && <TableCell>Para</TableCell>}
              <TableCell>Resultado</TableCell>
              <TableCell>Motivo</TableCell>
              <TableCell>Intento</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((event) => {
              const tip = outcomeTooltip(event);
              return (
                <TableRow key={event.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {event.recipientName?.trim() || '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {counterpartName(event)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Tooltip title={event.appointmentId}>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                      >
                        {shortAppointmentId(event.appointmentId)}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  {showRecipientType && (
                    <TableCell>{recipientLabel(event.recipientType)}</TableCell>
                  )}
                  <TableCell>
                    <Tooltip title={tip ?? ''} disableHoverListener={!tip}>
                      <Chip
                        size="small"
                        color={BATCH_EVENT_OUTCOME_COLOR[event.displayOutcome]}
                        label={BATCH_EVENT_OUTCOME_LABEL[event.displayOutcome]}
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ maxWidth: 280, display: 'block' }}
                    >
                      {motivoText(event)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {event.attemptNumber != null ? `#${event.attemptNumber}` : '—'}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
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
