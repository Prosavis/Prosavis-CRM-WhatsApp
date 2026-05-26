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

  return (
    <>
      <Tooltip title="Bot automatizado (IA): respuestas automáticas a mensajes entrantes en esta línea">
        <Box
          data-tour={tourDataTour}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1,
            py: 0.25,
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: on
              ? alpha(theme.palette.success.main, theme.palette.mode === 'dark' ? 0.2 : 0.12)
              : alpha(theme.palette.warning.main, theme.palette.mode === 'dark' ? 0.22 : 0.14),
          }}
        >
          <SmartToyIcon sx={{ fontSize: 20, color: on ? 'success.main' : 'warning.dark' }} />
          <Typography variant="body2" fontWeight={600} sx={{ display: { xs: 'none', sm: 'block' } }}>
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
            }}
          />
          {loading ? (
            <CircularProgress size={18} />
          ) : (
            <Switch
              size="small"
              checked={on}
              onChange={(_, checked) => onRequestToggle(checked)}
              sx={{ mr: -0.5 }}
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
