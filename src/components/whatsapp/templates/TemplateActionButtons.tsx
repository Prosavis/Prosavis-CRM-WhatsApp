import React from 'react';
import { Box } from '@mui/material';
import type { WhatsAppTemplateActionButton } from '@/utils/whatsappTemplateHelpers';

interface TemplateActionButtonsProps {
  buttons: WhatsAppTemplateActionButton[];
}

const TemplateActionButtons: React.FC<TemplateActionButtonsProps> = ({ buttons }) => {
  if (buttons.length === 0) return null;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
      {buttons.map((button) => {
        const label = button.url ? (
          <Box
            component="a"
            href={button.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            sx={{ color: 'inherit', textDecoration: 'none', display: 'block' }}
          >
            {button.text}
          </Box>
        ) : (
          button.text
        );
        return (
          <Box
            key={`${button.text}:${button.url ?? ''}`}
            sx={{
              borderTop: '1px solid',
              borderColor: 'divider',
              pt: 0.75,
              textAlign: 'center',
              color: '#0b8468',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            {label}
          </Box>
        );
      })}
    </Box>
  );
};

export default TemplateActionButtons;
