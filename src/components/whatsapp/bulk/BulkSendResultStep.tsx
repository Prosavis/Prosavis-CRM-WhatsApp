import React from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

export interface BulkSendResultStepProps {
  sent: number;
  failed: number;
  skipped: number;
  /** Fallidos + pendientes (reintentables en el wizard). */
  retryableCount?: number;
  jobId?: string | null;
  /** Preselecciona fallidos en Audiencia y vuelve al paso 1 del wizard. */
  onPrepareRetryWithFailed?: () => void;
  onViewInMetrics?: () => void;
  retrying?: boolean;
  error?: string | null;
}

const BulkSendResultStep: React.FC<BulkSendResultStepProps> = ({
  sent,
  failed,
  skipped,
  retryableCount = failed,
  jobId,
  onPrepareRetryWithFailed,
  onViewInMetrics,
  retrying = false,
  error,
}) => (
  <Box sx={{ textAlign: 'center', py: 4 }}>
    <CheckCircleOutlineIcon color={retryableCount > 0 ? 'warning' : 'success'} sx={{ fontSize: 56, mb: 1 }} />
    <Typography
      variant="h5"
      fontWeight={700}
      color={retryableCount > 0 ? 'warning.main' : 'success.main'}
      gutterBottom
    >
      {retryableCount > 0 ? 'Envío completado con fallos' : 'Envío completado'}
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
      {retryableCount > 0
        ? 'Los contactos que fallaron (o quedaron pendientes) se pueden preseleccionar en Audiencia para reintentar el mismo mensaje.'
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

    {retryableCount > 0 && onPrepareRetryWithFailed && (
      <Button
        variant="contained"
        color="warning"
        startIcon={retrying ? <CircularProgress size={18} color="inherit" /> : <ReplayIcon />}
        onClick={onPrepareRetryWithFailed}
        disabled={retrying}
      >
        {retrying
          ? 'Cargando fallidos…'
          : `Seleccionar ${retryableCount} y reintentar`}
      </Button>
    )}

    {jobId && onViewInMetrics && (
      <Button
        variant="outlined"
        startIcon={<OpenInNewIcon />}
        onClick={onViewInMetrics}
        disabled={retrying}
        sx={{ mt: retryableCount > 0 && onPrepareRetryWithFailed ? 1.5 : 0, display: 'block', mx: 'auto' }}
      >
        Ver detalle en métricas
      </Button>
    )}
  </Box>
);

export default BulkSendResultStep;
