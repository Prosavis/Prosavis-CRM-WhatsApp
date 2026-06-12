import React from 'react';
import { Box, Typography } from '@mui/material';
import type { WhatsAppTemplateSummary } from '@/services/whatsappService';
import WhatsAppTemplateCategoryChip from '@/components/whatsapp/WhatsAppTemplateCategoryChip';
import { previewTextForList } from '@/utils/whatsappTemplateHelpers';
import { getTemplateDisplayName } from './templateDisplayNames';

const BUBBLE_PREVIEW_SX = {
  bgcolor: '#d9fdd3',
  borderRadius: 2,
  px: 1.25,
  py: 0.75,
  boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
} as const;

interface MetaTemplateCardProps {
  template: WhatsAppTemplateSummary;
  selected?: boolean;
  subtitle?: string;
  onClick: () => void;
}

const MetaTemplateCard: React.FC<MetaTemplateCardProps> = ({
  template,
  selected = false,
  subtitle,
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
        bgcolor: selected ? 'action.selected' : 'background.paper',
        border: 2,
        borderColor: selected ? 'primary.main' : 'divider',
        transition: 'border-color 0.15s ease, background-color 0.15s ease',
        '&:hover': { bgcolor: selected ? 'action.selected' : 'action.hover' },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2,
        },
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
          {getTemplateDisplayName(template.name)}
        </Typography>
        <WhatsAppTemplateCategoryChip category={template.category} />
      </Box>
      {subtitle && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.75 }}>
          {subtitle}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
        {template.name} · {template.language}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Box sx={BUBBLE_PREVIEW_SX}>
          <Typography
            variant="body2"
            sx={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: '#111b21',
              lineHeight: 1.4,
              fontSize: '0.8125rem',
            }}
          >
            {previewTextForList(template)}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default MetaTemplateCard;
