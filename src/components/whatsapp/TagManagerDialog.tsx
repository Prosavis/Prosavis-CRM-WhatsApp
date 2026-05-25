import React, { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Box,
  Typography,
  CircularProgress,
  Tooltip,
  Popover,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { alpha } from '@mui/material/styles';
import type { WhatsAppTag } from '@/services/whatsappService';
import {
  createWhatsAppTag,
  updateWhatsAppTag,
  deleteWhatsAppTag as deleteTagApi,
} from '@/services/whatsappService';
import { WHATSAPP_TAG_PRESET_COLORS } from '@/constants';

interface TagManagerDialogProps {
  open: boolean;
  onClose: () => void;
  tags: WhatsAppTag[];
  /** Conversaciones por tagId (todas las convs de la línea). */
  tagCounts?: Record<string, number>;
  onTagsChanged: () => void;
}

const TagManagerDialog: React.FC<TagManagerDialogProps> = ({
  open,
  onClose,
  tags,
  tagCounts,
  onTagsChanged,
}) => {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(WHATSAPP_TAG_PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [saving, setSaving] = useState(false);

  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [colorTarget, setColorTarget] = useState<'new' | 'edit'>('new');

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createWhatsAppTag(newName.trim(), newColor);
      setNewName('');
      setNewColor(
        WHATSAPP_TAG_PRESET_COLORS[Math.floor(Math.random() * WHATSAPP_TAG_PRESET_COLORS.length)],
      );
      onTagsChanged();
    } catch (err) {
      console.error('Error creating tag:', err);
    } finally {
      setCreating(false);
    }
  }, [newName, newColor, onTagsChanged]);

  const handleStartEdit = useCallback((tag: WhatsAppTag) => {
    setEditId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || WHATSAPP_TAG_PRESET_COLORS[0]);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editId || !editName.trim()) return;
    setSaving(true);
    try {
      await updateWhatsAppTag(editId, {
        name: editName.trim(),
        color: editColor,
      });
      setEditId(null);
      onTagsChanged();
    } catch (err) {
      console.error('Error updating tag:', err);
    } finally {
      setSaving(false);
    }
  }, [editId, editName, editColor, onTagsChanged]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteTagApi(id);
      onTagsChanged();
    } catch (err) {
      console.error('Error deleting tag:', err);
    }
  }, [onTagsChanged]);

  const openColorPicker = (anchor: HTMLElement, target: 'new' | 'edit') => {
    setColorTarget(target);
    setColorAnchor(anchor);
  };

  const handleColorSelect = (color: string) => {
    if (colorTarget === 'new') setNewColor(color);
    else setEditColor(color);
    setColorAnchor(null);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Gestionar tags</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
          <Box
            onClick={(e) => openColorPicker(e.currentTarget, 'new')}
            sx={(theme) => ({
              width: 32,
              height: 32,
              borderRadius: '50%',
              bgcolor: newColor,
              cursor: 'pointer',
              flexShrink: 0,
              border: `2px solid ${alpha(theme.palette.common.black, 0.1)}`,
            })}
          />
          <TextField
            size="small"
            placeholder="Nuevo tag..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            sx={{ flex: 1 }}
          />
          <Button
            variant="contained"
            size="small"
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
          >
            {creating ? <CircularProgress size={18} /> : 'Crear'}
          </Button>
        </Box>

        {tags.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            No hay tags creados
          </Typography>
        ) : (
          <List dense>
            {tags.map((tag) => (
              <ListItem key={tag.id} sx={{ pl: 0 }}>
                {editId === tag.id ? (
                  <Box sx={{ display: 'flex', gap: 1, flex: 1, alignItems: 'center' }}>
                    <Box
                      onClick={(e) => openColorPicker(e.currentTarget, 'edit')}
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        bgcolor: editColor,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    />
                    <TextField
                      size="small"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); }}
                      sx={{ flex: 1 }}
                    />
                    <IconButton size="small" onClick={handleSaveEdit} disabled={saving}>
                      {saving ? <CircularProgress size={16} /> : <CheckIcon fontSize="small" color="success" />}
                    </IconButton>
                    <IconButton size="small" onClick={() => setEditId(null)}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ) : (
                  <>
                    <Box
                      sx={{
                        width: 16,
                        height: 16,
                        borderRadius: '50%',
                        bgcolor: tag.color || WHATSAPP_TAG_PRESET_COLORS[0],
                        mr: 1.5,
                        flexShrink: 0,
                      }}
                    />
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <span>{tag.name}</span>
                          {tagCounts && (
                            <Typography component="span" variant="caption" color="text.secondary">
                              ({tagCounts[tag.id] ?? 0})
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Tooltip title="Editar">
                        <IconButton size="small" onClick={() => handleStartEdit(tag)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar">
                        <IconButton size="small" onClick={() => handleDelete(tag.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </ListItemSecondaryAction>
                  </>
                )}
              </ListItem>
            ))}
          </List>
        )}

        <Popover
          open={Boolean(colorAnchor)}
          anchorEl={colorAnchor}
          onClose={() => setColorAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, p: 1, maxWidth: 180 }}>
            {WHATSAPP_TAG_PRESET_COLORS.map((c: string) => (
              <Box
                key={c}
                onClick={() => handleColorSelect(c)}
                sx={(theme) => ({
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  bgcolor: c,
                  cursor: 'pointer',
                  border:
                    (colorTarget === 'new' ? newColor : editColor) === c
                      ? `3px solid ${theme.palette.text.primary}`
                      : '2px solid transparent',
                  '&:hover': { opacity: 0.8 },
                })}
              />
            ))}
          </Box>
        </Popover>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TagManagerDialog;
