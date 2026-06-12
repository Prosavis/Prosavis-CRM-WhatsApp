import React from 'react';
import { Alert, Box, Chip, Stack, TextField, Typography } from '@mui/material';
import { buildDisplayMessageBody } from '@/utils/whatsappTemplateHelpers';
import type { BulkMessageState } from './bulkSendTypes';
import { BULK_CONFIRM_PHRASE } from './bulkSendTypes';

export interface BulkSendConfirmStepProps {
  recipientCount: number;
  message: BulkMessageState;
  botLabel: string;
  phoneDisplay: string;
  confirmPhrase: string;
  onConfirmPhraseChange: (value: string) => void;
  error: string | null;
}

const BulkSendConfirmStep: React.FC<BulkSendConfirmStepProps> = ({
  recipientCount,
  message,
  botLabel,
  phoneDisplay,
  confirmPhrase,
  onConfirmPhraseChange,
  error,
}) => {
  const messageSummary =
    message.mode === 'template' && message.selectedTemplate
      ? `Plantilla: ${message.selectedTemplate.name} (${message.selectedTemplate.language})`
      : `Texto libre (${message.text.length} caracteres)`;

  const previewBody =
    message.mode === 'template' && message.selectedTemplate
      ? buildDisplayMessageBody(
          message.selectedTemplate,
          message.headerValues,
          message.bodyValues,
        )
      : message.text.trim();

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', py: 2 }}>
      <Alert severity="warning" sx={{ mb: 2 }}>
        Estás a punto de enviar un mensaje a <strong>{recipientCount.toLocaleString('es-CO')}</strong>{' '}
        destinatarios. Esta acción no se puede deshacer.
      </Alert>

      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Línea WhatsApp
          </Typography>
          <Typography variant="body1">
            {botLabel} · {phoneDisplay}
          </Typography>
        </Box>

        <Box>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Tipo de mensaje
          </Typography>
          <Chip label={messageSummary} size="small" color="primary" variant="outlined" />
        </Box>

        <Box
          sx={{
            p: 1.5,
            borderRadius: 1,
            bgcolor: 'action.hover',
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
            Vista previa
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {previewBody || '—'}
          </Typography>
        </Box>

        <TextField
          fullWidth
          label="Confirmación de seguridad"
          placeholder={BULK_CONFIRM_PHRASE}
          value={confirmPhrase}
          onChange={(e) => onConfirmPhraseChange(e.target.value)}
          helperText={`Escribe exactamente: ${BULK_CONFIRM_PHRASE}`}
        />

        {error && <Alert severity="error">{error}</Alert>}
      </Stack>
    </Box>
  );
};

export default BulkSendConfirmStep;
