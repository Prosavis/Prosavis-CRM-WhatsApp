import React from 'react';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import type { JobApplicationsMetrics } from '@/types/jobApplications';

const CARDS = [
  { key: 'inbound', label: 'Ingreso' },
  { key: 'priority', label: 'Prioritarias' },
  { key: 'interviewsOpen', label: 'Entrevistas' },
  { key: 'hired', label: 'Contratadas' },
  { key: 'closures', label: 'Cierres' },
  { key: 'marianSpecial', label: 'Marian' },
] as const;

export type JobKpiKey = (typeof CARDS)[number]['key'];

interface JobApplicationsKpisProps {
  metrics?: JobApplicationsMetrics;
  loading?: boolean;
  error?: string | null;
  selected?: JobKpiKey | null;
  onSelect?: (key: JobKpiKey) => void;
}

export const JobApplicationsKpis: React.FC<JobApplicationsKpisProps> = ({
  metrics,
  loading,
  error,
  selected,
  onSelect,
}) => {
  const fmt = (value: number) => value.toLocaleString('es-CO');
  return (
    <Box sx={{ mb: 2 }}>
      <Stack
        direction="row"
        spacing={0}
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'auto',
          bgcolor: 'background.paper',
        }}
      >
        {CARDS.map((card, index) => {
          const active = selected === card.key;
          return (
            <ButtonBase
              key={card.key}
              focusRipple
              onClick={() => onSelect?.(card.key)}
              data-testid={`jobs-kpi-${card.key}`}
              sx={{
                flex: '1 0 120px',
                flexDirection: 'column',
                alignItems: 'flex-start',
                textAlign: 'left',
                px: 2,
                py: 1.5,
                borderLeft: index === 0 ? 'none' : '1px solid',
                borderColor: 'divider',
                bgcolor: active ? 'action.selected' : 'transparent',
                boxShadow: active ? (theme) => `inset 0 -2px 0 ${theme.palette.primary.main}` : 'none',
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: 10 }}
              >
                {card.label}
              </Typography>
              <Typography variant="h6" fontWeight={650} sx={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                {loading && !metrics ? '—' : fmt(metrics?.[card.key] ?? 0)}
              </Typography>
            </ButtonBase>
          );
        })}
      </Stack>
      {error ? (
        <Typography variant="body2" color="error" sx={{ mt: 1 }}>
          {error}
        </Typography>
      ) : null}
    </Box>
  );
};
