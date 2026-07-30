/**
 * Subvistas dentro de una familia (p. ej. Clientes / Cleaners / Historial).
 */

import React from 'react';
import { Box, ButtonBase, Stack, Typography } from '@mui/material';
import type { AutomationFamilyDef, AutoSubTab } from './automationFamilies';

export interface FamilyViewTabsProps {
  family: AutomationFamilyDef;
  value: AutoSubTab;
  onChange: (view: AutoSubTab) => void;
}

const FamilyViewTabs: React.FC<FamilyViewTabsProps> = ({
  family,
  value,
  onChange,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 1.5,
        mb: 2,
        pb: 1.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box>
        <Typography
          variant="overline"
          sx={{
            display: 'block',
            color: family.accent,
            fontWeight: 800,
            letterSpacing: '0.08em',
            lineHeight: 1.2,
          }}
        >
          {family.label}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
          {family.description}
        </Typography>
      </Box>

      <Stack
        direction="row"
        spacing={0.5}
        role="tablist"
        aria-label={`Vistas de ${family.shortLabel}`}
        sx={{
          p: 0.5,
          borderRadius: 2,
          bgcolor: 'action.hover',
        }}
      >
        {family.views.map((view) => {
          const selected = value === view.key;
          return (
            <ButtonBase
              key={view.key}
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(view.key)}
              sx={{
                px: 1.75,
                py: 0.85,
                borderRadius: 1.5,
                fontWeight: 700,
                fontSize: '0.8125rem',
                color: selected ? '#fff' : 'text.secondary',
                bgcolor: selected ? family.accent : 'transparent',
                transition: 'background-color 150ms ease, color 150ms ease',
                '&:hover': {
                  bgcolor: selected ? family.accent : 'action.selected',
                },
                '&:focus-visible': {
                  outline: `2px solid ${family.accent}`,
                  outlineOffset: 2,
                },
                '@media (prefers-reduced-motion: reduce)': {
                  transition: 'none',
                },
              }}
            >
              {view.label}
            </ButtonBase>
          );
        })}
      </Stack>
    </Box>
  );
};

export default FamilyViewTabs;
