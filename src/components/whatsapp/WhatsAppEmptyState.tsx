import React from 'react';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

const WhatsAppEmptyState: React.FC = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      bgcolor: (t) =>
        t.palette.mode === 'dark' ? 'background.default' : '#f0f2f5',
      gap: 2,
    }}
  >
    <WhatsAppIcon
      sx={{
        fontSize: 80,
        color: (t) =>
          t.palette.mode === 'dark' ? alpha(t.palette.common.white, 0.22) : '#bfc8d0',
      }}
    />
    <Typography variant="h5" color="text.secondary" fontWeight={300}>
      Prosavis CRM
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 400, textAlign: 'center' }}>
      Selecciona una conversación del panel izquierdo para comenzar a chatear con tus contactos
    </Typography>
  </Box>
);

export default WhatsAppEmptyState;
