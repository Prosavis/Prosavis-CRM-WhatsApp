import React from 'react';
import { Chip, Tooltip, useTheme } from '@mui/material';

type TemplateCategoryKey = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | 'UNKNOWN';

function resolveTemplateCategory(raw: string | undefined): TemplateCategoryKey {
  const u = (raw || '').toUpperCase().trim();
  if (u === 'UTILITY' || u === 'MARKETING' || u === 'AUTHENTICATION') return u;
  return 'UNKNOWN';
}

interface WhatsAppTemplateCategoryChipProps {
  category?: string;
}

const WhatsAppTemplateCategoryChip: React.FC<WhatsAppTemplateCategoryChipProps> = ({ category }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const key = resolveTemplateCategory(category);

  const specs: Record<
    TemplateCategoryKey,
    { label: string; tooltip: string; light: { bg: string; color: string; border: string }; dark: { bg: string; color: string; border: string } }
  > = {
    UTILITY: {
      label: 'Utilidad',
      tooltip:
        'Conversaciones de servicio al cliente o actualizaciones sobre un pedido o cuenta.',
      light: { bg: '#e8f5e9', color: '#1b5e20', border: '#a5d6a7' },
      dark: { bg: 'rgba(76,175,80,0.2)', color: '#a5d6a7', border: 'rgba(76,175,80,0.4)' },
    },
    MARKETING: {
      label: 'Marketing',
      tooltip: 'Promociones u ofertas. Meta cobra tarifa de marketing.',
      light: { bg: '#fff3e0', color: '#e65100', border: '#ffcc80' },
      dark: { bg: 'rgba(255,152,0,0.2)', color: '#ffcc80', border: 'rgba(255,152,0,0.4)' },
    },
    AUTHENTICATION: {
      label: 'Autenticación',
      tooltip: 'Códigos OTP o verificación. Reglas específicas de Meta.',
      light: { bg: '#e3f2fd', color: '#0d47a1', border: '#90caf9' },
      dark: { bg: 'rgba(33,150,243,0.2)', color: '#90caf9', border: 'rgba(33,150,243,0.4)' },
    },
    UNKNOWN: {
      label: 'Sin categoría',
      tooltip: 'Meta no devolvió categoría en la API.',
      light: { bg: '#f5f5f5', color: '#616161', border: '#e0e0e0' },
      dark: { bg: 'action.hover', color: 'text.secondary', border: 'divider' },
    },
  };

  const s = specs[key];
  const palette = isDark ? s.dark : s.light;

  return (
    <Tooltip title={s.tooltip} arrow placement="top">
      <Chip
        label={s.label}
        size="small"
        sx={{
          height: 22,
          fontSize: '0.7rem',
          fontWeight: 600,
          bgcolor: palette.bg,
          color: palette.color,
          border: `1px solid ${palette.border}`,
        }}
      />
    </Tooltip>
  );
};

export default WhatsAppTemplateCategoryChip;
export { resolveTemplateCategory };
