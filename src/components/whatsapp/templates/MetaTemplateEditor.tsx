import React, { useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import BookmarkAddOutlinedIcon from '@mui/icons-material/BookmarkAddOutlined';
import type { WhatsAppTemplateSummary } from '@/services/whatsappService';
import WhatsAppTemplateCategoryChip from '@/components/whatsapp/WhatsAppTemplateCategoryChip';
import {
  applyPlaceholdersToText,
  buildDisplayMessageBody,
  countSlotsForTemplate,
  getComponentText,
  getExampleValues,
  previewTextForList,
} from '@/utils/whatsappTemplateHelpers';
import { getTemplateDisplayName } from './templateDisplayNames';
import type { TemplateLibraryMode, TemplateVariableValues } from './templateLibraryTypes';

const BUBBLE_PREVIEW_SX = {
  bgcolor: '#d9fdd3',
  borderRadius: 2,
  px: 1.5,
  py: 0.75,
  boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
} as const;

interface MetaTemplateEditorProps {
  mode: TemplateLibraryMode;
  template: WhatsAppTemplateSummary;
  values: TemplateVariableValues;
  onValuesChange: (values: TemplateVariableValues) => void;
  onBack?: () => void;
  showBackButton?: boolean;
  suggestionReason?: string | null;
  sending?: boolean;
  sendError?: string | null;
  onSend?: () => void;
  onApplyDraft?: (text: string) => void;
  onConfirmSelect?: () => void;
  onSavePreset?: () => void;
}

const MetaTemplateEditor: React.FC<MetaTemplateEditorProps> = ({
  mode,
  template,
  values,
  onValuesChange,
  onBack,
  showBackButton = true,
  suggestionReason,
  sending = false,
  sendError,
  onSend,
  onApplyDraft,
  onConfirmSelect,
  onSavePreset,
}) => {
  const slots = useMemo(() => countSlotsForTemplate(template), [template]);
  const headerExamples = useMemo(
    () => getExampleValues(template.components, 'HEADER'),
    [template],
  );
  const bodyExamples = useMemo(() => getExampleValues(template.components, 'BODY'), [template]);

  const livePreview = useMemo(() => {
    const headerText = getComponentText(template.components, 'HEADER');
    const bodyText = getComponentText(template.components, 'BODY') || '';
    const parts: string[] = [];
    if (headerText) parts.push(applyPlaceholdersToText(headerText, values.header));
    if (bodyText) parts.push(applyPlaceholdersToText(bodyText, values.body));
    return parts.join('\n\n').trim() || previewTextForList(template);
  }, [template, values.body, values.header]);

  const canSendOrSelect =
    (slots.header === 0 || values.header.every((value) => value.trim())) &&
    (slots.body === 0 || values.body.every((value) => value.trim()));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
        {showBackButton && onBack && (
          <IconButton size="small" onClick={onBack} aria-label="Volver a la lista">
            <ArrowBackIcon fontSize="small" />
          </IconButton>
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2" fontWeight={700} noWrap>
            {getTemplateDisplayName(template.name)}
          </Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap">
            <WhatsAppTemplateCategoryChip category={template.category} />
            <Typography variant="caption" color="text.secondary">
              {template.language}
            </Typography>
          </Stack>
        </Box>
        {onSavePreset && (
          <IconButton size="small" onClick={onSavePreset} aria-label="Guardar pre-relleno del equipo">
            <BookmarkAddOutlinedIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {suggestionReason && (
        <Alert severity="info" sx={{ mb: 1.5, py: 0.5 }}>
          <Typography variant="caption">{suggestionReason}</Typography>
        </Alert>
      )}

      <Box sx={{ ...BUBBLE_PREVIEW_SX, mb: 1.5 }}>
        <Typography
          variant="body2"
          sx={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: '#111b21',
            lineHeight: 1.45,
            fontSize: '0.8125rem',
          }}
        >
          {livePreview}
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', pr: 0.25 }}>
        {slots.header > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
              Encabezado
            </Typography>
            {Array.from({ length: slots.header }).map((_, index) => (
              <TextField
                key={`header-${index}`}
                fullWidth
                size="small"
                sx={{ mb: 1 }}
                label={`Variable {{${index + 1}}}`}
                helperText={headerExamples[index] ? `Ej: ${headerExamples[index]}` : undefined}
                value={values.header[index] ?? ''}
                onChange={(event) => {
                  const next = [...values.header];
                  next[index] = event.target.value;
                  onValuesChange({ ...values, header: next });
                }}
              />
            ))}
          </Box>
        )}

        {slots.body > 0 && (
          <Box sx={{ mb: 1.5 }}>
            <Typography variant="caption" fontWeight={600} display="block" gutterBottom>
              Cuerpo
            </Typography>
            {Array.from({ length: slots.body }).map((_, index) => (
              <TextField
                key={`body-${index}`}
                fullWidth
                size="small"
                sx={{ mb: 1 }}
                label={`Variable {{${index + 1}}}`}
                helperText={bodyExamples[index] ? `Ej: ${bodyExamples[index]}` : undefined}
                value={values.body[index] ?? ''}
                onChange={(event) => {
                  const next = [...values.body];
                  next[index] = event.target.value;
                  onValuesChange({ ...values, body: next });
                }}
              />
            ))}
          </Box>
        )}
      </Box>

      {sendError && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => undefined}>
          {sendError}
        </Alert>
      )}

      <Stack spacing={1}>
        {mode === 'bulk' && onConfirmSelect && (
          <Button
            fullWidth
            variant="contained"
            disabled={!canSendOrSelect}
            onClick={onConfirmSelect}
          >
            Usar esta plantilla
          </Button>
        )}

        {(mode === 'inbox' || mode === 'booking') && onSend && (
          <Button
            fullWidth
            variant="contained"
            disabled={sending || !canSendOrSelect}
            onClick={onSend}
          >
            {sending ? <CircularProgress size={20} color="inherit" /> : 'Enviar plantilla'}
          </Button>
        )}

        {(mode === 'inbox' || mode === 'booking') && onApplyDraft && (
          <Button
            fullWidth
            variant="outlined"
            disabled={sending}
            onClick={() => {
              const display = buildDisplayMessageBody(template, values.header, values.body);
              onApplyDraft(display.replace(/^\[Plantilla:.*?\]\n/, ''));
            }}
          >
            Cargar en editor
          </Button>
        )}
      </Stack>
    </Box>
  );
};

export default MetaTemplateEditor;
