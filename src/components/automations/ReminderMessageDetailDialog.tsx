import React, { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ReplayIcon from '@mui/icons-material/Replay';
import { useNavigate } from 'react-router-dom';
import type { ReminderRow } from '@/types/reminderAutomations';
import {
  formatReminderSentDisplay,
  REMINDER_STATUS_COLOR,
  REMINDER_STATUS_LABEL,
  reminderStatusTooltip,
} from '@/types/reminderAutomations';
import { retryReminderSend } from '@/services/reminderAutomationsService';

function formatIso(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  });
}

const RETRYABLE_STATUSES = new Set(['failed', 'not_attempted', 'missing_phone']);

export interface ReminderMessageDetailDialogProps {
  row: ReminderRow | null;
  open: boolean;
  onClose: () => void;
  onRetrySuccess?: () => void;
  hideRetry?: boolean;
}

const ReminderMessageDetailDialog: React.FC<ReminderMessageDetailDialogProps> = ({
  row,
  open,
  onClose,
  onRetrySuccess,
  hideRetry = false,
}) => {
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  if (!row) return null;

  const openInbox = () => {
    if (!row.conversationStableKey) return;
    navigate(`/whatsapp?conversation=${encodeURIComponent(row.conversationStableKey)}`);
    onClose();
  };

  const showRetryButton = !hideRetry && RETRYABLE_STATUSES.has(row.deliveryStatus);
  const canRetry = showRetryButton && Boolean(row.phone);

  const handleRetry = async () => {
    setRetryError(null);
    setRetrying(true);
    try {
      await retryReminderSend({
        appointmentId: row.appointmentId,
        recipientType: row.recipientType,
      });
      onRetrySuccess?.();
      onClose();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Error al reintentar');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Detalle del recordatorio
        <IconButton
          aria-label="cerrar"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              Cita
            </Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
              {row.appointmentId}
            </Typography>
            <Typography variant="body2">
              Estado cita: <strong>{row.appointmentStatus}</strong>
            </Typography>
            <Typography variant="body2">Servicio: {formatIso(row.scheduledDate)}</Typography>
            {row.address && (
              <Typography variant="body2" color="text.secondary">
                {row.address}
              </Typography>
            )}
          </Box>

          <Divider />

          <Box>
            <Typography variant="overline" color="text.secondary">
              Destinatario
            </Typography>
            <Typography variant="body1" fontWeight={600}>
              {row.recipientName}
            </Typography>
            <Typography variant="body2">
              Cliente: {row.clientName ?? '—'} · Profesional: {row.professionalName ?? '—'}
            </Typography>
            <Typography variant="body2">Teléfono: {row.phone ?? '—'}</Typography>
          </Box>

          <Divider />

          <Box>
            <Typography variant="overline" color="text.secondary">
              Entrega
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Chip
                size="small"
                label={REMINDER_STATUS_LABEL[row.deliveryStatus]}
                color={REMINDER_STATUS_COLOR[row.deliveryStatus]}
                title={reminderStatusTooltip(row)}
              />
              <Typography variant="caption" color="text.secondary">
                {row.templateName}
              </Typography>
            </Stack>
            <DetailRow label="Envío" value={formatReminderSentDisplay(row)} />
            <DetailRow label="Intentos" value={String(row.attemptCount)} />
            <DetailRow label="Último intento" value={formatIso(row.lastAttemptAt)} />
            <DetailRow label="Firestore sentAt" value={formatIso(row.sentAt)} />
            <DetailRow label="Log status" value={row.logStatus ?? '—'} />
            <DetailRow label="Log created_at" value={formatIso(row.logCreatedAt)} />
            <DetailRow label="WA message ID" value={row.waMessageId ?? '—'} mono />
          </Box>

          {row.failureReason &&
            !['sent', 'ready', 'pending'].includes(row.deliveryStatus) && (
            <Box>
              <Typography variant="overline" color="error">
                Motivo del fallo
              </Typography>
              <Typography variant="body2" color="error.main">
                {row.failureReason}
              </Typography>
            </Box>
          )}

          {row.messageBody && (
            <Box>
              <Typography variant="overline" color="text.secondary">
                Mensaje
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  whiteSpace: 'pre-wrap',
                  bgcolor: 'action.hover',
                  p: 1.5,
                  borderRadius: 1,
                  fontSize: '0.8125rem',
                }}
              >
                {row.messageBody}
              </Typography>
            </Box>
          )}

          {row.logErrorMessage && row.logErrorMessage !== row.failureReason && (
            <Box>
              <Typography variant="overline" color="error">
                Error Meta
              </Typography>
              <Typography variant="body2" color="error.main">
                {row.logErrorMessage}
              </Typography>
            </Box>
          )}

          {retryError && (
            <Typography variant="body2" color="error.main">
              {retryError}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {showRetryButton && (
          <Button
            startIcon={retrying ? <CircularProgress size={16} /> : <ReplayIcon />}
            onClick={() => void handleRetry()}
            disabled={retrying || !canRetry}
            sx={{ textTransform: 'none' }}
          >
            Reintentar envío
          </Button>
        )}
        {row.conversationStableKey && (
          <Button
            startIcon={<OpenInNewIcon />}
            onClick={openInbox}
            sx={{ textTransform: 'none' }}
          >
            Abrir en Inbox
          </Button>
        )}
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
};

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <Typography variant="body2" sx={{ mb: 0.25 }}>
      <Box component="span" color="text.secondary">
        {label}:{' '}
      </Box>
      <Box component="span" sx={mono ? { fontFamily: 'monospace', fontSize: '0.8rem' } : undefined}>
        {value}
      </Box>
    </Typography>
  );
}

export default ReminderMessageDetailDialog;
