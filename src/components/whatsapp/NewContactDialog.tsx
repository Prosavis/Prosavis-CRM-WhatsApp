import React, { useState, useCallback, useEffect } from 'react';
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
  Chip,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import {
  ensureWhatsAppConversationFromLead,
  listWhatsAppTags,
  assignWhatsAppTags,
  type WhatsAppTag,
} from '@/services/whatsappService';
import { directoryService } from '@/services/directoryService';
import { normalizeDirectoryPhoneE164 } from '@/utils/directoryPhone';
import { coloredChipSx } from '@/utils/coloredChipStyles';

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
  const theme = useTheme();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagCatalog, setTagCatalog] = useState<WhatsAppTag[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listWhatsAppTags()
      .then((tags) => {
        if (!cancelled) setTagCatalog(tags);
      })
      .catch(() => {
        if (!cancelled) setTagCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const resetForm = useCallback(() => {
    setPhone('');
    setName('');
    setSelectedTagIds([]);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (saving) return;
    resetForm();
    onClose();
  }, [saving, onClose, resetForm]);

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

      const e164 =
        normalizeDirectoryPhoneE164(trimmedPhone) ?? `+${digits}`;
      const displayName = name.trim() || undefined;

      // Asegurar fila en crm_directory (además del sync por conversación).
      const existing = await directoryService.findByPhone(e164);
      let directoryId = existing[0]?.id;
      if (!directoryId) {
        const created = await directoryService.createEntry({
          fullName: displayName || e164,
          displayName,
          phone: e164,
          source: 'WHATSAPP_INBOUND',
          status: 'active',
          classification: 'unknown',
          whatsAppConversationId: result.conversationId,
        });
        directoryId = created.id;
      } else if (displayName || result.conversationId) {
        await directoryService.updateEntry(directoryId, {
          ...(displayName
            ? { fullName: displayName, displayName }
            : {}),
          whatsAppConversationId: result.conversationId,
        });
      }

      if (selectedTagIds.length > 0) {
        // Preferir tags en la conversación (trigger sincroniza directorio).
        await assignWhatsAppTags(result.conversationId, selectedTagIds);
        if (directoryId) {
          try {
            await directoryService.setClassificationTags(directoryId, selectedTagIds);
          } catch {
            // Trigger WA→directory puede haber ganado la carrera; no bloquear el alta.
          }
        }
      }

      resetForm();
      onCreated(result.conversationId);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error al crear contacto';
      if (msg.includes('bloqueado')) setError('Este número está bloqueado');
      else if (msg.includes('opt-out')) setError('Este contacto tiene opt-out activo');
      else setError(msg);
    } finally {
      setSaving(false);
    }
  }, [phone, name, phoneNumberId, onCreated, selectedTagIds, resetForm]);

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
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Clasificación (tags WhatsApp)
            </Typography>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {tagCatalog.map((tag) => {
                const selected = selectedTagIds.includes(tag.id);
                return (
                  <Chip
                    key={tag.id}
                    label={tag.name}
                    size="small"
                    variant={selected ? 'filled' : 'outlined'}
                    disabled={saving}
                    onClick={() =>
                      setSelectedTagIds((prev) =>
                        prev.includes(tag.id)
                          ? prev.filter((id) => id !== tag.id)
                          : [...prev, tag.id]
                      )
                    }
                    sx={
                      selected
                        ? coloredChipSx(theme, tag.color, 'filled')
                        : coloredChipSx(theme, tag.color, 'outlined')
                    }
                  />
                );
              })}
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
              Usa el tag Empresas para contactos B2B. El contacto queda en el directorio.
            </Typography>
          </Box>
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
