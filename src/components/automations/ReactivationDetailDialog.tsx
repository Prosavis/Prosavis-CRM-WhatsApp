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
import ReplayIcon from '@mui/icons-material/Replay';
import BlockIcon from '@mui/icons-material/Block';
import {
  REACTIVATION_STATUS_COLOR,
  REACTIVATION_STATUS_HINT,
  REACTIVATION_STATUS_LABEL,
  formatNextSendAt,
  formatReactivationDate,
  type ReactivationDashboardRow,
} from '@/types/reactivationAutomations';
import {
  retryReactivationStep,
  suspendReactivationRecipient,
} from '@/services/reactivationAutomationsService';

function formatDay(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export interface ReactivationDetailDialogProps {
  row: ReactivationDashboardRow | null;
  open: boolean;
  onClose: () => void;
  onRetrySuccess?: () => void;
  onSuspendSuccess?: () => void;
}

const ReactivationDetailDialog: React.FC<ReactivationDetailDialogProps> = ({
  row,
  open,
  onClose,
  onRetrySuccess,
  onSuspendSuccess,
}) => {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [suspending, setSuspending] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  if (!row) return null;

  const step = row.dueStep ?? (row.sequenceStep < 6 ? row.sequenceStep + 1 : row.sequenceStep);
  const canRetry =
    Boolean(row.phone) &&
    row.reactivationsEnabled &&
    row.status !== 'opt_out' &&
    step >= 1 &&
    step <= 6;

  const canSuspend = row.status !== 'opt_out';

  const handleRetry = async () => {
    if (!canRetry) return;
    setRetryError(null);
    setRetrying(true);
    try {
      await retryReactivationStep({ directoryId: row.directoryId, stepNumber: step });
      onRetrySuccess?.();
      onClose();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Error al enviar');
    } finally {
      setRetrying(false);
    }
  };

  const handleSuspend = async () => {
    setRetryError(null);
    setSuspending(true);
    try {
      await suspendReactivationRecipient({ directoryId: row.directoryId });
      onSuspendSuccess?.();
      onClose();
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Error al suspender');
    } finally {
      setSuspending(false);
      setConfirmSuspend(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Detalle de reactivación
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
              Contacto
            </Typography>
            <Typography variant="body1" fontWeight={600}>
              {row.recipientName}
            </Typography>
            <Typography variant="body2">Teléfono: {row.phone ?? '—'}</Typography>
            <Typography variant="body2">
              Última cita: {formatDay(row.lastAppointmentDate)}
              {row.daysInactive != null ? ` · ${row.daysInactive} días inactivo` : ''}
            </Typography>
          </Box>

          <Divider />

          <Box>
            <Typography variant="overline" color="text.secondary">
              Cadencia
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Chip
                size="small"
                label={REACTIVATION_STATUS_LABEL[row.status]}
                color={REACTIVATION_STATUS_COLOR[row.status]}
              />
              {row.isRecurring && <Chip size="small" label="Recurrente" variant="outlined" />}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {REACTIVATION_STATUS_HINT[row.status]}
            </Typography>
            <DetailRow
              label="Paso"
              value={`${row.sequenceStep || 0}${row.dueStep ? ` → ${row.dueStep}` : ''} · ${row.nextStepLabel || '—'}`}
            />
            <DetailRow label="Plantilla" value={row.templateName ?? '—'} mono />
            <DetailRow label="Último contacto" value={formatReactivationDate(row.lastContactAt)} />
            <DetailRow label="Próximo envío" value={formatNextSendAt(row.nextSendAt)} />
            <DetailRow label="Última respuesta" value={formatReactivationDate(row.lastResponseAt)} />
          </Box>

          {row.messagePreview && (
            <Box>
              <Typography variant="overline" color="text.secondary">
                Vista previa del mensaje
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
                {row.messagePreview}
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
        {canSuspend && !confirmSuspend && (
          <Button
            color="error"
            startIcon={<BlockIcon />}
            onClick={() => setConfirmSuspend(true)}
            disabled={retrying || suspending}
            sx={{ textTransform: 'none', mr: 'auto' }}
          >
            Suspender (opt-out)
          </Button>
        )}
        {confirmSuspend && (
          <Button
            color="error"
            variant="contained"
            startIcon={suspending ? <CircularProgress size={16} color="inherit" /> : <BlockIcon />}
            onClick={() => void handleSuspend()}
            disabled={suspending}
            sx={{ textTransform: 'none', mr: 'auto' }}
          >
            Confirmar suspensión
          </Button>
        )}
        {canRetry && (
          <Button
            startIcon={retrying ? <CircularProgress size={16} /> : <ReplayIcon />}
            onClick={() => void handleRetry()}
            disabled={retrying || suspending}
            sx={{ textTransform: 'none' }}
          >
            Enviar paso ahora
          </Button>
        )}
        <Button onClick={onClose} disabled={suspending}>
          Cerrar
        </Button>
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

export default ReactivationDetailDialog;
