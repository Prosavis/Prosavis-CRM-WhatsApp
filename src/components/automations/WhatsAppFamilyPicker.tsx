/**
 * Selector de las 3 familias WhatsApp (Recordatorios / Reactivaciones / Post-servicio).
 */

import React from 'react';
import { Box, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import {
  AUTOMATION_FAMILIES,
  type AutomationFamilyDef,
  type WaFamily,
} from './automationFamilies';

export interface WhatsAppFamilyPickerProps {
  value: WaFamily;
  onChange: (family: WaFamily) => void;
}

const FamilyCard: React.FC<{
  family: AutomationFamilyDef;
  selected: boolean;
  onSelect: () => void;
}> = ({ family, selected, onSelect }) => {
  const Icon = family.icon;

  return (
    <Box
      component="button"
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      sx={{
        flex: 1,
        minWidth: 0,
        textAlign: 'left',
        cursor: 'pointer',
        border: '1px solid',
        borderColor: selected ? family.accent : 'divider',
        borderRadius: 2,
        bgcolor: selected ? family.accentSoft : 'background.paper',
        p: { xs: 1.25, sm: 1.75 },
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease',
        boxShadow: selected ? `inset 0 0 0 1px ${family.accent}` : 'none',
        '&:hover': {
          borderColor: family.accent,
          bgcolor: family.accentSoft,
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
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          bgcolor: selected ? family.accent : 'transparent',
          transition: 'background-color 160ms ease',
        }}
      />
      <Stack direction="row" spacing={1.25} alignItems="flex-start">
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1.5,
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
            bgcolor: selected ? family.accent : 'action.hover',
            color: selected ? '#fff' : family.accent,
          }}
        >
          <Icon sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="subtitle2"
            fontWeight={800}
            sx={{
              letterSpacing: '-0.01em',
              color: selected ? family.accent : 'text.primary',
              lineHeight: 1.25,
            }}
          >
            {family.shortLabel}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: { xs: 'none', md: 'block' },
              mt: 0.35,
              lineHeight: 1.35,
            }}
          >
            {family.description}
          </Typography>
        </Box>
      </Stack>
    </Box>
  );
};

const WhatsAppFamilyPicker: React.FC<WhatsAppFamilyPickerProps> = ({
  value,
  onChange,
}) => {
  const theme = useTheme();
  const stacked = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Stack
      direction={stacked ? 'column' : 'row'}
      spacing={1.25}
      sx={{ mb: 2 }}
      role="group"
      aria-label="Familia de automatización WhatsApp"
    >
      {AUTOMATION_FAMILIES.map((family) => (
        <FamilyCard
          key={family.id}
          family={family}
          selected={value === family.id}
          onSelect={() => onChange(family.id)}
        />
      ))}
    </Stack>
  );
};

export default WhatsAppFamilyPicker;
