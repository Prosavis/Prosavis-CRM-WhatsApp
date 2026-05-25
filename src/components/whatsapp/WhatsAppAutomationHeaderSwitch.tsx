import React from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import SmartToyIcon from '@mui/icons-material/SmartToy';

export interface WhatsAppAutomationHeaderSwitchProps {
  fullscreen?: boolean;
  geminiEnabled: boolean | null;
  loading: boolean;
  confirmTarget: boolean | null;
  onRequestToggle: (nextChecked: boolean) => void;
  onConfirmApply: () => void;
  onConfirmCancel: () => void;
  /** Para el tour Joyride */
  tourDataTour?: string;
}

const WhatsAppAutomationHeaderSwitch: React.FC<WhatsAppAutomationHeaderSwitchProps> = ({
  fullscreen,
  geminiEnabled,
  loading,
  confirmTarget,
  onRequestToggle,
  onConfirmApply,
  onConfirmCancel,
  tourDataTour,
}) => {
  const theme = useTheme();
  const on = geminiEnabled ?? false;

  const labelColor = fullscreen ? 'rgba(255,255,255,0.95)' : 'text.primary';

  return (
    <>
      <Tooltip title="Bot automatizado (Gemini): respuestas automáticas a mensajes entrantes en esta línea">
        <Box
          data-tour={tourDataTour}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: fullscreen ? 0.75 : 1,
            py: 0.25,
            borderRadius: 1,
            border: fullscreen ? '1px solid rgba(255,255,255,0.35)' : '1px solid',
            borderColor: fullscreen ? 'transparent' : 'divider',
            bgcolor: fullscreen
              ? 'rgba(255,255,255,0.12)'
              : on
                ? alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.2 : 0.12)
                : alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.22 : 0.14),
          }}
        >
          <SmartToyIcon sx={{ fontSize: 20, color: fullscreen ? '#fff' : on ? 'success.main' : 'warning.dark' }} />
          <Typography variant="body2" fontWeight={600} sx={{ color: labelColor, display: { xs: 'none', sm: 'block' } }}>
            Bot
          </Typography>
          <Chip
            label={on ? 'On' : 'Off'}
            size="small"
            color={on ? 'success' : 'warning'}
            sx={{
              fontWeight: 700,
              height: 22,
              '& .MuiChip-label': { px: 0.75 },
              ...(fullscreen && {
                bgcolor: on ? 'rgba(76,175,80,0.35)' : 'rgba(255,152,0,0.35)',
                color: '#fff',
              }),
            }}
          />
          {loading ? (
            <CircularProgress size={18} sx={{ color: fullscreen ? '#fff' : 'inherit' }} />
          ) : (
            <Switch
              size="small"
              checked={on}
              onChange={(_, checked) => onRequestToggle(checked)}
              sx={{
                mr: -0.5,
                ...(fullscreen && {
                  '& .MuiSwitch-switchBase.Mui-checked': { color: '#a5d6a7' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: 'rgba(165,214,167,0.5)',
                  },
                }),
              }}
            />
          )}
        </Box>
      </Tooltip>

      <Dialog open={confirmTarget !== null} onClose={onConfirmCancel}>
        <DialogTitle>
          {confirmTarget ? 'Activar bot automatizado' : 'Desactivar bot automatizado'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            {confirmTarget
              ? 'Activa las respuestas automáticas del bot para todos los chats de WhatsApp. Los mensajes entrantes se clasificarán y responderán automáticamente cuando corresponda.'
              : 'Desactiva las respuestas automáticas del bot para todos los chats de WhatsApp. Los mensajes seguirán llegando al inbox; podrás responder manualmente.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={onConfirmCancel}>Cancelar</Button>
          <Button variant="contained" color={confirmTarget ? 'success' : 'warning'} onClick={onConfirmApply}>
            {confirmTarget ? 'Activar' : 'Desactivar'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default WhatsAppAutomationHeaderSwitch;
