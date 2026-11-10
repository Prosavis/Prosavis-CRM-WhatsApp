import React from 'react';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import type { JobApplicationsMetrics } from '@/types/jobApplications';

const CARDS = [
  { key: 'inbound', label: 'Ingreso' },
  { key: 'priority', label: 'Prioritarias' },
  { key: 'interviewsOpen', label: 'Entrevistas abiertas' },
  { key: 'hired', label: 'Contratadas' },
  { key: 'closures', label: 'Cierres' },
  { key: 'marianSpecial', label: 'Marian (fuera de KPI)' },
] as const;

export type JobKpiKey = (typeof CARDS)[number]['key'];

interface JobApplicationsKpisProps {
  metrics?: JobApplicationsMetrics;
  loading?: boolean;
  error?: string | null;
  onSelect?: (key: JobKpiKey) => void;
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
