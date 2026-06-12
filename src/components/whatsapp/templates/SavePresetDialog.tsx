import React, { useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';

interface SavePresetDialogProps {
  open: boolean;
  defaultLabel: string;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (presetLabel: string) => void;
}

const SavePresetDialog: React.FC<SavePresetDialogProps> = ({
  open,
  defaultLabel,
  saving = false,
  error,
  onClose,
  onSave,
}) => {
  const [label, setLabel] = useState(defaultLabel);

  React.useEffect(() => {
    if (open) setLabel(defaultLabel);
  }, [defaultLabel, open]);

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle>Guardar pre-relleno del equipo</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label="Nombre visible"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          helperText="Todos los operadores CRM verán este favorito."
        />
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          disabled={saving || !label.trim()}
          onClick={() => onSave(label.trim())}
          startIcon={saving ? <CircularProgress size={18} color="inherit" /> : undefined}
        >
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SavePresetDialog;
