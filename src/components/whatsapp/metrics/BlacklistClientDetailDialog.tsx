import React, { useEffect, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import BlockIcon from '@mui/icons-material/Block';
import type { DirectoryClientMetricRow } from '@/types/whatsapp';
import { directoryService } from '@/services/directoryService';
import DirectoryClassificationTagPicker from '@/components/directory/DirectoryClassificationTagPicker';

function formatLastAppointment(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export interface BlacklistClientDetailDialogProps {
  open: boolean;
  row: DirectoryClientMetricRow | null;
  onClose: () => void;
  /** Tras guardar motivo o tags: refrescar métricas. */
  onSaved?: () => void;
}

/**
 * Dialog de detalle para filas del segmento Lista negra (clientes).
 * Motivo humano → crm_directory.internal_notes.
 */
const BlacklistClientDetailDialog: React.FC<BlacklistClientDetailDialogProps> = ({
  open,
  row,
  onClose,
  onSaved,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [classification, setClassification] = useState<string | null>(null);
  const [motivoDraft, setMotivoDraft] = useState('');
  const [savedMotivo, setSavedMotivo] = useState('');

  useEffect(() => {
    if (!open || !row) return;

    let cancelled = false;
    setError(null);
    setLoading(true);
    setName(row.name?.trim() || 'Sin nombre');
    setPhone(row.phone);
    setTags(row.tags ?? []);
    setClassification(row.classification);
    const initialMotivo = row.blacklistReason?.trim() || '';
    setMotivoDraft(initialMotivo);
    setSavedMotivo(initialMotivo);
    setEmail(null);

    void (async () => {
      try {
        const entry = await directoryService.getEntryById(row.id);
        if (cancelled || !entry) return;
        const displayName =
          entry.displayName?.trim() || entry.fullName?.trim() || row.name?.trim() || 'Sin nombre';
        setName(displayName);
        setPhone(entry.phone ?? row.phone);
        setEmail(entry.email?.trim() || null);
        setTags(entry.tags ?? row.tags ?? []);
        setClassification(entry.classification ?? row.classification);
        const notes = entry.internalNotes?.trim() || '';
        // Preferir notas internas (fuente de verdad); si vacías, conservar motivo de la fila.
        const nextMotivo = notes || initialMotivo;
        setMotivoDraft(nextMotivo);
        setSavedMotivo(notes);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el contacto');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, row]);

  if (!row) return null;

  const initial = (name || '?').charAt(0).toUpperCase();
  const motivoDirty = motivoDraft.trim() !== savedMotivo.trim();

  const handleSaveMotivo = async () => {
    setError(null);
    setSaving(true);
    try {
      const next = motivoDraft.trim();
      await directoryService.updateEntry(row.id, { internalNotes: next });
      setSavedMotivo(next);
      setMotivoDraft(next);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el motivo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Lista negra
        <IconButton
          aria-label="Cerrar"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ bgcolor: 'error.main', width: 48, height: 48 }}>{initial}</Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={600} noWrap>
                  {name}
                </Typography>
                {email && (
                  <Typography variant="caption" color="text.secondary" display="block" noWrap>
                    {email}
                  </Typography>
                )}
              </Box>
            </Stack>

            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: 'grey.50',
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Typography variant="caption" color="text.secondary" display="block">
                <Box component="span" fontWeight={600}>
                  Nombre:{' '}
                </Box>
                {name}
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                <Box component="span" fontWeight={600}>
                  Tel:{' '}
                </Box>
                {phone || '—'}
              </Typography>
              {email && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  sx={{ mt: 0.5 }}
                >
                  <Box component="span" fontWeight={600}>
                    Email:{' '}
                  </Box>
                  {email}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                <Box component="span" fontWeight={600}>
                  Última cita:{' '}
                </Box>
                {formatLastAppointment(row.lastAppointmentDate)}
              </Typography>
            </Box>

            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              <Chip
                icon={<BlockIcon sx={{ fontSize: 14 }} />}
                label="Lista negra"
                size="small"
                color="error"
                sx={{ height: 24, fontSize: '0.75rem' }}
              />
            </Stack>

            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Tags
              </Typography>
              <DirectoryClassificationTagPicker
                entry={{
                  id: row.id,
                  classification,
                  tags,
                }}
                compact
                autoSave
                onSaved={(entry) => {
                  setTags(entry.tags ?? []);
                  setClassification(entry.classification ?? null);
                  onSaved?.();
                }}
                onError={(message) => setError(message)}
              />
            </Box>

            <Box>
              <Typography
                variant="caption"
                color="error.main"
                fontWeight={600}
                sx={{ mb: 0.75, display: 'block' }}
              >
                Motivo
              </Typography>
              <TextField
                value={motivoDraft}
                onChange={(e) => setMotivoDraft(e.target.value)}
                multiline
                minRows={3}
                fullWidth
                size="small"
                placeholder="Escribe el motivo por el que está en lista negra…"
                disabled={saving}
              />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Se guarda en notas internas del directorio (crm_directory.internal_notes).
              </Typography>
            </Box>

            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} color="inherit">
          Cerrar
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => void handleSaveMotivo()}
          disabled={loading || saving || !motivoDirty}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Guardar motivo
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BlacklistClientDetailDialog;
