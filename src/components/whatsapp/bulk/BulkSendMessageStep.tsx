import React, { useMemo } from 'react';
import {
  Box,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material';
import ArticleIcon from '@mui/icons-material/Article';
import TemplateIcon from '@mui/icons-material/Description';
import TemplateLibrary from '@/components/whatsapp/templates/TemplateLibrary';
import {
  buildDisplayMessageBody,
} from '@/utils/whatsappTemplateHelpers';
import { getWhatsAppBubbleSx } from '@/utils/whatsappBubblePreview';
import {
  WHATSAPP_TEMPLATE_SECTIONS,
  resolveWhatsAppTemplatePanelSection,
} from '@/constants/whatsappTemplateSections';
import type { BulkMessageState } from './bulkSendTypes';

export interface BulkSendMessageStepProps {
  wabaId: string;
  message: BulkMessageState;
  onMessageChange: (message: BulkMessageState) => void;
}

const BulkSendMessageStep: React.FC<BulkSendMessageStepProps> = ({
  wabaId,
  message,
  onMessageChange,
}) => {
  const theme = useTheme();
  const bubbleSx = getWhatsAppBubbleSx(theme);

  const previewText = useMemo(() => {
    if (message.mode === 'text') {
      return message.text.trim() || 'Escribe tu mensaje…';
    }
    if (!message.selectedTemplate) {
      return 'Selecciona una plantilla aprobada por Meta';
    }
    return buildDisplayMessageBody(
      message.selectedTemplate,
      message.headerValues,
      message.bodyValues,
    );
  }, [message]);

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, minHeight: 0, flex: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <ToggleButtonGroup
          exclusive
          value={message.mode}
          onChange={(_, value) => {
            if (value) onMessageChange({ ...message, mode: value });
          }}
          size="small"
          sx={{ mb: 2, flexShrink: 0 }}
        >
          <ToggleButton value="template" sx={{ textTransform: 'none', gap: 0.5 }}>
            <TemplateIcon fontSize="small" />
            Plantilla Meta
          </ToggleButton>
          <ToggleButton value="text" sx={{ textTransform: 'none', gap: 0.5 }}>
            <ArticleIcon fontSize="small" />
            Mensaje personalizado
          </ToggleButton>
        </ToggleButtonGroup>

        {message.mode === 'text' ? (
          <TextField
            fullWidth
            multiline
            rows={8}
            label="Mensaje"
            placeholder="Escribe el mensaje que recibirán todos los destinatarios..."
            value={message.text}
            onChange={(e) => onMessageChange({ ...message, text: e.target.value })}
            helperText={`${message.text.length} caracteres`}
          />
        ) : (
          <Box sx={{ flex: 1, minHeight: 360, border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
            <TemplateLibrary
              mode="bulk"
              compact
              wabaId={wabaId}
              selectedTemplate={message.selectedTemplate}
              values={{ header: message.headerValues, body: message.bodyValues }}
              onSelect={(template, values) => {
                onMessageChange({
                  ...message,
                  mode: 'template',
                  selectedTemplate: template,
                  headerValues: values.header,
                  bodyValues: values.body,
                });
              }}
            />
          </Box>
        )}
      </Box>

      <Box
        sx={{
          width: { xs: '100%', md: 300 },
          flexShrink: 0,
          p: 2,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
          position: { md: 'sticky' },
          top: 0,
          alignSelf: { md: 'flex-start' },
        }}
      >
        <Typography variant="subtitle2" fontWeight={700} gutterBottom>
          Vista previa
        </Typography>
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: 'action.hover',
            minHeight: 120,
          }}
        >
          <Box sx={bubbleSx}>
            <Typography variant="body2" component="div">
              {previewText}
            </Typography>
          </Box>
        </Box>
        {message.mode === 'template' && message.selectedTemplate && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            {WHATSAPP_TEMPLATE_SECTIONS.find(
              (section) =>
                section.key ===
                resolveWhatsAppTemplatePanelSection(
                  message.selectedTemplate!.name,
                  message.selectedTemplate!.category,
                ),
            )?.description ?? 'Plantilla aprobada por Meta Business'}
          </Typography>
        )}
      </Box>
    </Box>
  );
};

export default BulkSendMessageStep;
