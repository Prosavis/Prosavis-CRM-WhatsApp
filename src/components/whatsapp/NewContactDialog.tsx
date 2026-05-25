import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  CircularProgress,
  Alert,
  Box,
} from '@mui/material';
import { ensureWhatsAppConversationFromLead } from '@/services/whatsappService';

interface NewContactDialogProps {
  open: boolean;
  onClose: () => void;
  phoneNumberId?: string;
  onCreated: (conversationId: string) => void;
}

const NewContactDialog: React.FC<NewContactDialogProps> = ({
  open,
  onClose,
  phoneNumberId,
  onCreated,
}) => {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (saving) return;
    setPhone('');
    setName('');
    setError(null);
    onClose();
  }, [saving, onClose]);

  const handleSubmit = useCallback(async () => {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      setError('El teléfono es obligatorio');
      return;
    }

    const digits = trimmedPhone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      setError('Número de teléfono inválido (10-15 dígitos)');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await ensureWhatsAppConversationFromLead({
        phone: trimmedPhone,
        name: name.trim() || undefined,
        phoneNumberId,
      });
      setPhone('');
      setName('');
      onCreated(result.conversationId);
    } catch (err: any) {
      const msg = err?.message || 'Error al crear contacto';
      if (msg.includes('bloqueado')) setError('Este número está bloqueado');
      else if (msg.includes('opt-out')) setError('Este contacto tiene opt-out activo');
      else setError(msg);
    } finally {
      setSaving(false);
    }
  }, [phone, name, phoneNumberId, onCreated]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Nuevo contacto</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <TextField
            label="Teléfono"
            placeholder="573001234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            fullWidth
            required
            helperText="Incluir código de país sin + (ej: 573001234567)"
            disabled={saving}
            autoFocus
          />
          <TextField
            label="Nombre (opcional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            disabled={saving}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={saving}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={saving || !phone.trim()}
        >
          {saving ? <CircularProgress size={20} /> : 'Crear'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default NewContactDialog;
