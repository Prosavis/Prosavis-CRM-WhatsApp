import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import type { WhatsAppTag } from '@/services/whatsappService';
import {
  getInboxCategorySettings,
  saveInboxCategorySettings,
} from '@/services/whatsappService';
import { useAuth } from '@/hooks/useAuth';
import { normalizeInboxTagName } from '@/constants/inboxCategories';

export interface OutOfCoverageTagsDialogProps {
  open: boolean;
  onClose: () => void;
  tags: WhatsAppTag[];
  /** IDs actualmente usados por la categoría (para preselección inmediata). */
  currentTagIds: string[];
  onSaved: (tagIds: string[]) => void;
}

const OutOfCoverageTagsDialog: React.FC<OutOfCoverageTagsDialogProps> = ({
  open,
  onClose,
  tags,
  currentTagIds,
  onSaved,
}) => {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setError(null);
    setSelected(currentTagIds);
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const settings = await getInboxCategorySettings('fuera_cobertura');
        if (cancelled) return;
        if (settings) setSelected(settings.tagIds);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar la configuración');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentTagIds]);

  const filteredTags = useMemo(() => {
    const term = normalizeInboxTagName(search);
    if (!term) return tags;
    return tags.filter((t) => normalizeInboxTagName(t.name).includes(term));
  }, [tags, search]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveInboxCategorySettings('fuera_cobertura', selected, user?.id);
      onSaved(selected);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }, [selected, user?.id, onSaved, onClose]);

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Tags de Fuera de cobertura</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Elige las ciudades o localidades sin cobertura. Todos los admins verán la misma lista.
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="Buscar tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <List dense sx={{ maxHeight: 360, overflow: 'auto', mx: -1 }}>
            {filteredTags.map((tag) => {
              const checked = selected.includes(tag.id);
              return (
                <ListItemButton key={tag.id} onClick={() => toggle(tag.id)} dense>
                  <Checkbox
                    edge="start"
                    checked={checked}
                    tabIndex={-1}
                    disableRipple
                    size="small"
                    sx={{ pointerEvents: 'none' }}
                  />
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      bgcolor: tag.color || '#1976d2',
                      mr: 1,
                      flexShrink: 0,
                    }}
                  />
                  <ListItemText primary={tag.name} />
                </ListItemButton>
              );
            })}
            {filteredTags.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 2 }}>
                No hay tags que coincidan.
              </Typography>
            )}
          </List>
        )}
        {error && (
          <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
            {error}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          {selected.length} tag{selected.length === 1 ? '' : 's'} seleccionado
          {selected.length === 1 ? '' : 's'}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={() => void handleSave()} disabled={saving || loading}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default OutOfCoverageTagsDialog;
