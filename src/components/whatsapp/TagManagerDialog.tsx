import { useState, type FormEvent } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { WHATSAPP_TAG_PRESET_COLORS } from '@/constants/whatsapp';
import type { WhatsAppTag } from '@/types/whatsapp';

interface TagManagerDialogProps {
  open: boolean;
  tags: WhatsAppTag[];
  onClose: () => void;
  onCreate: (name: string, color: string) => Promise<void>;
}

export default function TagManagerDialog({
  open,
  tags,
  onClose,
  onCreate,
}: TagManagerDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(WHATSAPP_TAG_PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      await onCreate(name.trim(), color);
      setName('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Tags del inbox</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {tags.map((tag) => (
              <Chip
                key={tag.id}
                label={tag.name}
                sx={{ bgcolor: tag.color ?? '#e8f5e9' }}
              />
            ))}
            {!tags.length && (
              <Typography color="text.secondary">No hay tags creados.</Typography>
            )}
          </Stack>
          <Box component="form" id="tag-form" onSubmit={handleSubmit}>
            <Stack spacing={1.5}>
              <TextField
                label="Nombre del tag"
                value={name}
                onChange={(event) => setName(event.target.value)}
                fullWidth
              />
              <Stack direction="row" spacing={1}>
                {WHATSAPP_TAG_PRESET_COLORS.map((preset) => (
                  <Box
                    key={preset}
                    component="button"
                    type="button"
                    onClick={() => setColor(preset)}
                    aria-label={`Color ${preset}`}
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      border:
                        color === preset
                          ? '3px solid #13201d'
                          : '1px solid rgba(0,0,0,0.15)',
                      bgcolor: preset,
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </Stack>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
        <Button
          type="submit"
          form="tag-form"
          variant="contained"
          disabled={saving || !name.trim()}
        >
          Crear tag
        </Button>
      </DialogActions>
    </Dialog>
  );
}
