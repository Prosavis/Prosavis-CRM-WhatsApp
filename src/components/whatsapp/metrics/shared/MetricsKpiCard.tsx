import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { DesignTokens } from '@/constants/designSystem';

interface MetricsKpiCardProps {
  label: string;
  value: string;
  detail?: string;
  selected?: boolean;
  onClick?: () => void;
  accent?: string;
  tone?: 'default' | 'success' | 'warning' | 'risk' | 'info' | 'neutral';
}

const MetricsKpiCard: React.FC<MetricsKpiCardProps> = ({
  label,
  value,
  detail,
  selected = false,
  onClick,
  accent = 'primary.main',
  tone = 'default',
}) => {
  const valueColor = (theme: Theme): string => {
    switch (tone) {
      case 'success':
        return theme.palette.mode === 'dark'
          ? DesignTokens.dataViz.dark.favorite
          : DesignTokens.dataViz.light.favorite;
      case 'warning':
        return theme.palette.mode === 'dark'
          ? DesignTokens.dataViz.dark.warning
          : DesignTokens.dataViz.light.warning;
      case 'risk':
        return theme.palette.mode === 'dark'
          ? DesignTokens.dataViz.dark.risk
          : DesignTokens.dataViz.light.risk;
      case 'info':
        return theme.palette.mode === 'dark'
          ? DesignTokens.dataViz.dark.recurring
          : DesignTokens.dataViz.light.recurring;
      case 'neutral':
        return theme.palette.text.secondary;
      case 'default':
        return accent;
      default: {
        const exhaustive: never = tone;
        return exhaustive;
      }
    }
  };

  const content = (
    <Box sx={{ textAlign: 'left', width: '100%', minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      <Typography
        variant="h6"
        sx={{
          mt: 0.35,
          color: valueColor,
          fontWeight: 750,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </Typography>
      {detail ? (
        <Typography variant="caption" color="text.secondary">
          {detail}
        </Typography>
      ) : null}
    </Box>
  );

  const sx = {
    width: '100%',
    minHeight: 92,
    px: 1.75,
    py: 1.5,
    borderRadius: 2,
    border: '1px solid',
    borderColor: selected ? 'primary.main' : 'divider',
    bgcolor: selected ? 'action.selected' : 'background.paper',
    transition: 'background-color 160ms cubic-bezier(0.2,0,0,1), border-color 160ms cubic-bezier(0.2,0,0,1)',
    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
    '&:focus-visible': {
      outline: '3px solid',
      outlineColor: 'secondary.main',
      outlineOffset: 2,
    },
  } as const;

  return onClick ? (
    <ButtonBase
      onClick={onClick}
      aria-pressed={selected}
      sx={sx}
    >
      {content}
    </ButtonBase>
  ) : (
    <Box sx={sx}>{content}</Box>
  );
};

export default MetricsKpiCard;
