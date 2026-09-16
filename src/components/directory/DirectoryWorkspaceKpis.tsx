import React from 'react';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import type { DirectoryWorkspaceKpis } from '@/utils/directoryWorkspace';
import { directoryKpiTarget, type DirectoryCrmView } from '@/utils/directoryViews';
import type { DirectoryWorkspaceSegment } from '@/utils/directoryWorkspace';

const CARDS = [
  { key: 'total', label: 'Total del directorio' },
  { key: 'scheduled', label: 'Agendados' },
  { key: 'canceledOrRejected', label: 'Cancelados / rechazados' },
  { key: 'recurring', label: 'Recurrentes' },
  { key: 'reactivation', label: 'Para reactivar' },
] as const;

interface DirectoryWorkspaceKpisProps {
  kpis?: DirectoryWorkspaceKpis;
  loading?: boolean;
  error?: string | null;
  view: DirectoryCrmView;
  segment: DirectoryWorkspaceSegment | null;
  onSelect: (next: { view: DirectoryCrmView; segment: DirectoryWorkspaceSegment | null }) => void;
}

export const DirectoryWorkspaceKpisBar: React.FC<DirectoryWorkspaceKpisProps> = ({
  kpis,
  loading,
  error,
  view,
  segment,
  onSelect,
}) => {
  const fmt = (value: number) => value.toLocaleString('es-CO');
  return (
    <Box sx={{ mb: 2 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        useFlexGap
        flexWrap="wrap"
      >
        {CARDS.map((card) => {
          const target = directoryKpiTarget(card.key);
          const selected = view === target.view && segment === target.segment;
          return (
            <ButtonBase
              key={card.key}
              focusRipple
              onClick={() => onSelect(target)}
              data-testid={`directory-kpi-${card.key}`}
              aria-pressed={selected}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                flex: '1 1 160px',
                textAlign: 'left',
                p: 1.75,
                border: '1px solid',
                borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: selected ? 'action.selected' : 'background.paper',
                borderRadius: 2,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {card.label}
              </Typography>
              <Typography variant="h5" fontWeight={700}>
                {loading && !kpis ? '—' : fmt(kpis?.[card.key] ?? 0)}
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
