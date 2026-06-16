import React from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';

export interface BulkSendResultStepProps {
  sent: number;
  failed: number;
  skipped: number;
  onRetryFailed?: () => void;
  retrying?: boolean;
  error?: string | null;
}

const BulkSendResultStep: React.FC<BulkSendResultStepProps> = ({
  sent,
  failed,
  skipped,
  onRetryFailed,
  retrying = false,
  error,
}) => (
  <Box sx={{ textAlign: 'center', py: 4 }}>
    <CheckCircleOutlineIcon color={failed > 0 ? 'warning' : 'success'} sx={{ fontSize: 56, mb: 1 }} />
    <Typography
      variant="h5"
      fontWeight={700}
      color={failed > 0 ? 'warning.main' : 'success.main'}
      gutterBottom
    >
      {failed > 0 ? 'Envío completado con fallos' : 'Envío completado'}
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
      {failed > 0
        ? 'Algunos mensajes no se pudieron entregar. Puedes reintentar solo con los que faltaron.'
        : 'El proceso de envío masivo finalizó. Revisa el monitor para más detalle.'}
    </Typography>
    <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap sx={{ mb: 3 }}>
      <Chip label={`Enviados: ${sent}`} color="success" />
      <Chip label={`Fallidos: ${failed}`} color={failed > 0 ? 'error' : 'default'} />
      <Chip label={`Omitidos: ${skipped}`} variant="outlined" />
    </Stack>

    {error && (
      <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>
        {error}
      </Alert>
    )}

    {failed > 0 && onRetryFailed && (
      <Button
        variant="contained"
        color="warning"
        startIcon={retrying ? <CircularProgress size={18} color="inherit" /> : <ReplayIcon />}
        onClick={onRetryFailed}
        disabled={retrying}
      >
        {retrying ? 'Reintentando…' : `Reintentar los ${failed} que fallaron`}
      </Button>
    )}
  </Box>
);

export default BulkSendResultStep;
