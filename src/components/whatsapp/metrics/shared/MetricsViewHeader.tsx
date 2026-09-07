import React from 'react';
import {
  Box,
  Chip,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import type { Theme } from '@mui/material/styles';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';

export interface MetricsInsight {
  label: string;
  value: string;
  detail?: string;
  tone?: 'default' | 'positive' | 'warning' | 'risk';
}

interface MetricsViewHeaderProps {
  title: string;
  purpose: string;
  periodLabel?: string;
  universeLabel?: string;
  updatedAt?: number | null;
  insights?: MetricsInsight[];
}

function insightColor(theme: Theme, tone: MetricsInsight['tone']): string {
  switch (tone) {
    case 'positive':
      return theme.palette.mode === 'dark' ? theme.palette.success.light : theme.palette.success.dark;
    case 'warning':
      return theme.palette.mode === 'dark' ? theme.palette.warning.light : theme.palette.warning.dark;
    case 'risk':
      return theme.palette.mode === 'dark' ? theme.palette.error.light : theme.palette.error.dark;
    case 'default':
    case undefined:
      return theme.palette.primary.main;
    default: {
      const exhaustive: never = tone;
      return exhaustive;
    }
  }
}

const MetricsViewHeader: React.FC<MetricsViewHeaderProps> = ({
  title,
  purpose,
  periodLabel,
  universeLabel,
  updatedAt,
  insights = [],
}) => (
  <Box component="header" sx={{ mb: 2.5 }}>
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', md: 'flex-end' }}
      spacing={1.5}
    >
      <Box sx={{ maxWidth: 720 }}>
        <Typography component="h1" variant="h5" fontWeight={700} letterSpacing="-0.01em">
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {purpose}
        </Typography>
      </Box>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {periodLabel && <Chip size="small" label={periodLabel} variant="outlined" />}
        {universeLabel && <Chip size="small" label={universeLabel} variant="outlined" />}
        {updatedAt ? (
          <Chip
            size="small"
            label={`Actualizado ${new Date(updatedAt).toLocaleTimeString('es-CO', {
              hour: '2-digit',
              minute: '2-digit',
            })}`}
            variant="outlined"
          />
        ) : null}
      </Stack>
    </Stack>
    {insights.length > 0 ? (
      <Stack
        component="section"
        aria-label="Hallazgos principales"
        direction={{ xs: 'column', sm: 'row' }}
        divider={<Divider orientation="vertical" flexItem />}
        spacing={{ xs: 1.25, sm: 2.5 }}
        sx={{
          mt: 2,
          p: 2,
          borderRadius: 2,
          bgcolor: 'action.hover',
          '& .MuiDivider-root': { display: { xs: 'none', sm: 'block' } },
        }}
      >
        {insights.slice(0, 3).map((insight) => (
          <Stack key={insight.label} direction="row" spacing={1.1} sx={{ flex: 1, minWidth: 0 }}>
            <InsightsOutlinedIcon
              aria-hidden="true"
              sx={{ color: (theme) => insightColor(theme, insight.tone), fontSize: 19, mt: 0.25 }}
            />
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', fontWeight: 600 }}
              >
                {insight.label}
              </Typography>
              <Typography
                variant="subtitle1"
                sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
              >
                {insight.value}
              </Typography>
              {insight.detail ? (
                <Typography variant="caption" color="text.secondary">
                  {insight.detail}
                </Typography>
              ) : null}
            </Box>
          </Stack>
        ))}
      </Stack>
    ) : null}
  </Box>
);

export default MetricsViewHeader;
