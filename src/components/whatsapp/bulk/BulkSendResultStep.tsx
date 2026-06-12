import React from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

export interface BulkSendResultStepProps {
  sent: number;
  failed: number;
  skipped: number;
}

const BulkSendResultStep: React.FC<BulkSendResultStepProps> = ({ sent, failed, skipped }) => (
  <Box sx={{ textAlign: 'center', py: 4 }}>
    <CheckCircleOutlineIcon color="success" sx={{ fontSize: 56, mb: 1 }} />
    <Typography variant="h5" fontWeight={700} color="success.main" gutterBottom>
      Envío completado
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
      El proceso de envío masivo finalizó. Revisa el monitor para más detalle.
    </Typography>
    <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap>
      <Chip label={`Enviados: ${sent}`} color="success" />
      <Chip label={`Fallidos: ${failed}`} color="error" />
      <Chip label={`Omitidos: ${skipped}`} variant="outlined" />
    </Stack>
  </Box>
);

export default BulkSendResultStep;
