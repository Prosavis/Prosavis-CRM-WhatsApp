import React from 'react';
import {
  Box,
  Button,
  Chip,
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
import { useNavigate } from 'react-router-dom';
import type { ReminderRow } from '@/types/reminderAutomations';
import { REMINDER_STATUS_COLOR, REMINDER_STATUS_LABEL } from '@/types/reminderAutomations';

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

export interface ReminderMessageDetailDialogProps {
  row: ReminderRow | null;
  open: boolean;
  onClose: () => void;
}

const ReminderMessageDetailDialog: React.FC<ReminderMessageDetailDialogProps> = ({
  row,
  open,
  onClose,
}) => {
  const navigate = useNavigate();

  if (!row) return null;

  const openInbox = () => {
    if (!row.conversationStableKey) return;
    navigate(`/whatsapp?conversation=${encodeURIComponent(row.conversationStableKey)}`);
    onClose();
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
            <Typography variant="body2">Teléfono: {row.phoneMasked ?? '—'}</Typography>
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
              />
              <Typography variant="caption" color="text.secondary">
                {row.templateName}
              </Typography>
            </Stack>
            <DetailRow label="Firestore sentAt" value={formatIso(row.sentAt)} />
            <DetailRow label="Log status" value={row.logStatus ?? '—'} />
            <DetailRow label="Log created_at" value={formatIso(row.logCreatedAt)} />
            <DetailRow label="WA message ID" value={row.waMessageId ?? '—'} mono />
          </Box>

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

          {row.logErrorMessage && (
            <Box>
              <Typography variant="overline" color="error">
                Error Meta
              </Typography>
              <Typography variant="body2" color="error.main">
                {row.logErrorMessage}
              </Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
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
