import React from 'react';
import { Box, Chip, Typography } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import type { WhatsAppTemplatePreset } from '@/services/whatsappService';
import { getTemplateDisplayName } from './templateDisplayNames';

interface TemplatePresetCardProps {
  preset: WhatsAppTemplatePreset;
  templateLabel?: string;
  preview?: string;
  onClick: () => void;
}

const TemplatePresetCard: React.FC<TemplatePresetCardProps> = ({
  preset,
  templateLabel,
  preview,
  onClick,
}) => {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      sx={{
        cursor: 'pointer',
        borderRadius: 1.5,
        p: 1.25,
        mb: 1,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        <StarIcon sx={{ fontSize: 16, color: 'warning.main' }} />
        <Typography variant="body2" fontWeight={700}>
          {preset.presetLabel}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
        {templateLabel ?? getTemplateDisplayName(preset.templateName)} · {preset.templateLanguage}
      </Typography>
      {preview && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
          {preview.length > 120 ? `${preview.slice(0, 120)}…` : preview}
        </Typography>
      )}
      <Chip label="Pre-relleno del equipo" size="small" variant="outlined" sx={{ height: 22 }} />
    </Box>
  );
};

export default TemplatePresetCard;
