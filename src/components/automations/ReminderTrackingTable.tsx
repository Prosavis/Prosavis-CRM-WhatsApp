import React, { useMemo, useState } from 'react';
import {
  Box,
  Chip,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
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
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VisibilityIcon from '@mui/icons-material/Visibility';
import type { ReminderDeliveryStatus, ReminderRow } from '@/types/reminderAutomations';
import { REMINDER_STATUS_COLOR, REMINDER_STATUS_LABEL } from '@/types/reminderAutomations';

function formatServiceDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

function formatSentAt(row: ReminderRow): string {
  if (row.sentAt) {
    return new Date(row.sentAt).toLocaleString('es-CO', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Bogota',
    });
  }
  if (row.logCreatedAt) {
    return new Date(row.logCreatedAt).toLocaleString('es-CO', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Bogota',
    });
  }
  return '—';
}

function formatPhone(phone: string | null): string {
  if (!phone) return '—';
  return phone;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

export interface ReminderTrackingTableProps {
  rows: ReminderRow[];
  onViewDetail: (row: ReminderRow) => void;
  onToggleReminder?: (row: ReminderRow, enabled: boolean) => void;
  toggleLoadingKey?: string | null;
  readOnly?: boolean;
}

const ReminderTrackingTable: React.FC<ReminderTrackingTableProps> = ({
  rows,
  onViewDetail,
  onToggleReminder,
  toggleLoadingKey,
  readOnly = false,
}) => {
  const [statusFilter, setStatusFilter] = useState<ReminderDeliveryStatus | 'all'>('all');

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return rows;
    return rows.filter((r) => r.deliveryStatus === statusFilter);
  }, [rows, statusFilter]);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1.5 }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="reminder-status-filter">Estado</InputLabel>
          <Select
            labelId="reminder-status-filter"
            label="Estado"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ReminderDeliveryStatus | 'all')}
          >
            <MenuItem value="all">Todos</MenuItem>
            {(Object.keys(REMINDER_STATUS_LABEL) as ReminderDeliveryStatus[]).map((status) => (
              <MenuItem key={status} value={status}>
                {REMINDER_STATUS_LABEL[status]}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Cita</TableCell>
              <TableCell>Destinatario</TableCell>
              <TableCell>Teléfono</TableCell>
              <TableCell>Servicio</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell>Envío</TableCell>
              <TableCell>Template / WA ID</TableCell>
              <TableCell align="right">Acción</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    Sin registros para este filtro.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => {
                const toggleKey = row.recipientKey
                  ? `${row.recipientKey}:${row.recipientType}`
                  : null;
                const canToggle = !readOnly && Boolean(row.recipientKey && row.phone);
                const toggleTooltip = !row.phone
                  ? 'Sin teléfono registrado'
                  : !row.recipientKey
                    ? 'Destinatario sin identificador estable en directorio'
                    : 'Activar o desactivar recordatorio 24h para este destinatario';

                return (
                  <TableRow key={`${row.appointmentId}-${row.recipientType}`} hover>
                    <TableCell>
                      <StackCopyId id={row.appointmentId} />
                    </TableCell>
                    <TableCell>{row.recipientName}</TableCell>
                    <TableCell>{formatPhone(row.phone)}</TableCell>
                    <TableCell>{formatServiceDate(row.scheduledDate)}</TableCell>
                    <TableCell>
                      <Tooltip title={row.failureReason ?? ''} disableHoverListener={!row.failureReason}>
                        <Chip
                          size="small"
                          label={REMINDER_STATUS_LABEL[row.deliveryStatus]}
                          color={REMINDER_STATUS_COLOR[row.deliveryStatus]}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell>{formatSentAt(row)}</TableCell>
                    <TableCell>
                      <Typography variant="caption" display="block">
                        {row.templateName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {row.waMessageId ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        {!readOnly && onToggleReminder && (
                          <Tooltip title={toggleTooltip}>
                            <FormControlLabel
                              sx={{ mr: 0 }}
                              control={
                                <Switch
                                  size="small"
                                  checked={row.remindersEnabled}
                                  disabled={!canToggle || toggleLoadingKey === toggleKey}
                                  onChange={(e) => onToggleReminder(row, e.target.checked)}
                                />
                              }
                              label=""
                            />
                          </Tooltip>
                        )}
                        <Tooltip title="Ver detalle">
                          <IconButton size="small" onClick={() => onViewDetail(row)}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

function StackCopyId({ id }: { id: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Typography variant="caption" sx={{ fontFamily: 'monospace', maxWidth: 120 }} noWrap>
        {id}
      </Typography>
      <Tooltip title="Copiar ID">
        <IconButton size="small" onClick={() => void copyText(id)}>
          <ContentCopyIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}

export default ReminderTrackingTable;
