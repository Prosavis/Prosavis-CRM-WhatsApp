import React from 'react';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import type { JobApplicationsMetrics } from '@/types/jobApplications';

const CARDS = [
  { key: 'total', label: 'Solicitudes Job' },
  { key: 'needsReview', label: 'Por revisar' },
  { key: 'hired', label: 'Contratadas' },
  { key: 'rejectedOrWithdrawn', label: 'Descartadas / retiradas' },
  { key: 'marianSpecial', label: 'Marian (fuera de KPI)' },
] as const;

interface JobApplicationsKpisProps {
  metrics?: JobApplicationsMetrics;
  loading?: boolean;
  error?: string | null;
  onSelect?: (key: (typeof CARDS)[number]['key']) => void;
}

export const JobApplicationsKpis: React.FC<JobApplicationsKpisProps> = ({
  metrics,
  loading,
  error,
  onSelect,
}) => {
  const fmt = (value: number) => value.toLocaleString('es-CO');
  return (
    <Box sx={{ mb: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} useFlexGap flexWrap="wrap">
        {CARDS.map((card) => (
          <ButtonBase
            key={card.key}
            focusRipple
            onClick={() => onSelect?.(card.key)}
            data-testid={`jobs-kpi-${card.key}`}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              flex: '1 1 150px',
              textAlign: 'left',
              p: 1.75,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              borderRadius: 2,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {card.label}
            </Typography>
            <Typography variant="h5" fontWeight={700}>
              {loading && !metrics ? '—' : fmt(metrics?.[card.key] ?? 0)}
            </Typography>
          </ButtonBase>
        ))}
      </Stack>
      {error ? (
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          {error}
        </Typography>
      ) : null}
    </Box>
  );
};
