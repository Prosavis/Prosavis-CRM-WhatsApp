import React from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';

interface MetricsPageStateProps {
  loading: boolean;
  error?: string | null;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
  children: React.ReactNode;
}

const MetricsPageState: React.FC<MetricsPageStateProps> = ({
  loading,
  error,
  empty = false,
  emptyTitle = 'No hay datos para este alcance',
  emptyDescription = 'Amplía el periodo o limpia los filtros para volver a consultar.',
  onRetry,
  children,
}) => {
  if (loading) {
    return (
      <Stack
        spacing={2}
        role="status"
        aria-live="polite"
        aria-label="Cargando métricas"
        data-testid="metrics-loading"
      >
        <Skeleton variant="rounded" height={88} />
        <Skeleton variant="rounded" height={320} />
        <Skeleton variant="rounded" height={180} />
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          onRetry ? (
            <Button
              color="inherit"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={onRetry}
            >
              Reintentar
            </Button>
          ) : undefined
        }
      >
        <AlertTitle>No pudimos cargar esta vista</AlertTitle>
        {error}
      </Alert>
    );
  }

  if (empty) {
    return (
      <Box
        role="status"
        sx={{
          minHeight: 240,
          display: 'grid',
          placeItems: 'center',
          textAlign: 'center',
          px: 3,
          borderRadius: 2,
          bgcolor: 'action.hover',
        }}
      >
        <Box sx={{ maxWidth: 480 }}>
          <Typography variant="h6" component="h2" gutterBottom>
            {emptyTitle}
          </Typography>
          <Typography color="text.secondary">{emptyDescription}</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box aria-busy="false" data-testid="metrics-ready">
      {children}
    </Box>
  );
};

export default MetricsPageState;
