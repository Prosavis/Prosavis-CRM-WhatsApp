import React, { useCallback, useMemo, useState } from 'react';
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
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Collapse,
  Divider,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { alpha } from '@mui/material/styles';
import type { WhatsAppTag } from '@/services/whatsappService';
import type { WhatsAppTagFolder } from '@/types/whatsapp';
import {
  createWhatsAppTag,
  updateWhatsAppTag,
  deleteWhatsAppTag as deleteTagApi,
  createWhatsAppTagFolder,
  updateWhatsAppTagFolder,
  deleteWhatsAppTagFolder,
  reorderWhatsAppTagFolders,
} from '@/services/whatsappService';
import { WHATSAPP_TAG_PRESET_COLORS } from '@/constants';
import { buildTagFolderDisplayItems } from '@/utils/tagFolders';
import TagColorPickerPopover from './TagColorPickerPopover';

interface TagManagerDialogProps {
  open: boolean;
  onClose: () => void;
  tags: WhatsAppTag[];
  folders: WhatsAppTagFolder[];
  /** Conversaciones por tagId (todas las convs de la línea). */
  tagCounts?: Record<string, number>;
  onTagsChanged: () => void;
}

const TagManagerDialog: React.FC<TagManagerDialogProps> = ({
  open,
  onClose,
  tags,
  folders,
  tagCounts,
  onTagsChanged,
}) => {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(WHATSAPP_TAG_PRESET_COLORS[0]);
  const [newFolderId, setNewFolderId] = useState<string>('');
  const [creating, setCreating] = useState(false);

  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editFolderId, setEditFolderId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const [editFolderIdState, setEditFolderIdState] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [savingFolder, setSavingFolder] = useState(false);

  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [colorTarget, setColorTarget] = useState<'new' | 'edit'>('new');

  const [folderOpened, setFolderOpened] = useState<Record<string, boolean>>({});

  const displayItems = useMemo(
    () => buildTagFolderDisplayItems(tags, folders),
    [tags, folders],
  );

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [folders],
  );

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createWhatsAppTag(
        newName.trim(),
        newColor,
        newFolderId || null,
      );
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
  }, [newName, newColor, newFolderId, onTagsChanged]);

  const handleCreateFolder = useCallback(async () => {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await createWhatsAppTagFolder(newFolderName.trim());
      setNewFolderName('');
      onTagsChanged();
    } catch (err) {
      console.error('Error creating tag folder:', err);
    } finally {
      setCreatingFolder(false);
    }
  }, [newFolderName, onTagsChanged]);

  const handleStartEdit = useCallback((tag: WhatsAppTag) => {
    setEditId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || WHATSAPP_TAG_PRESET_COLORS[0]);
    setEditFolderId(tag.folderId ?? '');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editId || !editName.trim()) return;
    setSaving(true);
    try {
      await updateWhatsAppTag(editId, {
        name: editName.trim(),
        color: editColor,
        folderId: editFolderId || null,
      });
      setEditId(null);
      onTagsChanged();
    } catch (err) {
      console.error('Error updating tag:', err);
    } finally {
      setSaving(false);
    }
  }, [editId, editName, editColor, editFolderId, onTagsChanged]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteTagApi(id);
      onTagsChanged();
    } catch (err) {
      console.error('Error deleting tag:', err);
    }
  }, [onTagsChanged]);

  const handleStartEditFolder = useCallback((folder: WhatsAppTagFolder) => {
    setEditFolderIdState(folder.id);
    setEditFolderName(folder.name);
  }, []);

  const handleSaveFolder = useCallback(async () => {
    if (!editFolderIdState || !editFolderName.trim()) return;
    setSavingFolder(true);
    try {
      await updateWhatsAppTagFolder(editFolderIdState, { name: editFolderName.trim() });
      setEditFolderIdState(null);
      onTagsChanged();
    } catch (err) {
      console.error('Error updating tag folder:', err);
    } finally {
      setSavingFolder(false);
    }
  }, [editFolderIdState, editFolderName, onTagsChanged]);

  const handleDeleteFolder = useCallback(async (folderId: string) => {
    try {
      await deleteWhatsAppTagFolder(folderId);
      onTagsChanged();
    } catch (err) {
      console.error('Error deleting tag folder:', err);
    }
  }, [onTagsChanged]);

  const handleMoveFolder = useCallback(async (folderId: string, direction: -1 | 1) => {
    const ids = sortedFolders.map((f) => f.id);
    const index = ids.indexOf(folderId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const next = [...ids];
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await reorderWhatsAppTagFolders(next);
      onTagsChanged();
    } catch (err) {
      console.error('Error reordering tag folders:', err);
    }
  }, [sortedFolders, onTagsChanged]);

  const openColorPicker = (anchor: HTMLElement, target: 'new' | 'edit') => {
    setColorTarget(target);
    setColorAnchor(anchor);
  };

  const handleColorSelect = (color: string) => {
    if (colorTarget === 'new') setNewColor(color);
    else setEditColor(color);
  };

  const isFolderExpanded = (folderId: string) => folderOpened[folderId] === true;

  const renderTagRow = (tag: WhatsAppTag, indent = false) => (
    <ListItem key={tag.id} sx={{ pl: indent ? 3 : 0 }}>
      {editId === tag.id ? (
        <Box sx={{ display: 'flex', gap: 1, flex: 1, alignItems: 'center', flexWrap: 'wrap', pr: 1 }}>
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
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveEdit(); }}
            sx={{ flex: 1, minWidth: 120 }}
          />
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id={`edit-folder-${tag.id}`}>Carpeta</InputLabel>
            <Select
              labelId={`edit-folder-${tag.id}`}
              label="Carpeta"
              value={editFolderId}
              onChange={(e) => setEditFolderId(e.target.value)}
            >
              <MenuItem value="">
                <em>Ninguna</em>
              </MenuItem>
              {sortedFolders.map((f) => (
                <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <IconButton size="small" onClick={() => void handleSaveEdit()} disabled={saving}>
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
              <IconButton size="small" onClick={() => void handleDelete(tag.id)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </ListItemSecondaryAction>
        </>
      )}
    </ListItem>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Gestionar tags</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center' }}>
          <CreateNewFolderOutlinedIcon color="action" fontSize="small" />
          <TextField
            size="small"
            placeholder="Nueva carpeta..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateFolder(); }}
            sx={{ flex: 1 }}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={() => void handleCreateFolder()}
            disabled={creatingFolder || !newFolderName.trim()}
          >
            {creatingFolder ? <CircularProgress size={18} /> : 'Carpeta'}
          </Button>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
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
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
            sx={{ flex: 1, minWidth: 140 }}
          />
          {sortedFolders.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="new-tag-folder">Carpeta</InputLabel>
              <Select
                labelId="new-tag-folder"
                label="Carpeta"
                value={newFolderId}
                onChange={(e) => setNewFolderId(e.target.value)}
              >
                <MenuItem value="">
                  <em>Ninguna</em>
                </MenuItem>
                {sortedFolders.map((f) => (
                  <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Button
            variant="contained"
            size="small"
            onClick={() => void handleCreate()}
            disabled={creating || !newName.trim()}
          >
            {creating ? <CircularProgress size={18} /> : 'Crear'}
          </Button>
        </Box>

        <Divider sx={{ mb: 1 }} />

        {tags.length === 0 && folders.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            No hay tags ni carpetas
          </Typography>
        ) : (
          <List dense>
            {displayItems.map((item) => {
              if (item.type === 'tag') {
                return renderTagRow(item.tag);
              }

              const folder = item.folder;
              const expanded = isFolderExpanded(folder.id);
              const folderIndex = sortedFolders.findIndex((f) => f.id === folder.id);

              return (
                <Box key={`folder-${folder.id}`}>
                  <ListItem sx={{ pl: 0, bgcolor: (t) => alpha(t.palette.primary.main, 0.04), borderRadius: 1, mb: 0.25 }}>
                    {editFolderIdState === folder.id ? (
                      <Box sx={{ display: 'flex', gap: 1, flex: 1, alignItems: 'center', pr: 1 }}>
                        <FolderOutlinedIcon fontSize="small" color="action" />
                        <TextField
                          size="small"
                          value={editFolderName}
                          onChange={(e) => setEditFolderName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveFolder(); }}
                          sx={{ flex: 1 }}
                        />
                        <IconButton size="small" onClick={() => void handleSaveFolder()} disabled={savingFolder}>
                          {savingFolder ? <CircularProgress size={16} /> : <CheckIcon fontSize="small" color="success" />}
                        </IconButton>
                        <IconButton size="small" onClick={() => setEditFolderIdState(null)}>
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ) : (
                      <>
                        <IconButton size="small" onClick={() => setFolderOpened((p) => ({ ...p, [folder.id]: !expanded }))}>
                          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                        </IconButton>
                        <FolderOutlinedIcon fontSize="small" color="action" sx={{ mr: 1 }} />
                        <ListItemText
                          primary={folder.name}
                          secondary={`${item.tags.length} tag${item.tags.length === 1 ? '' : 's'}`}
                          primaryTypographyProps={{ fontWeight: 600 }}
                        />
                        <ListItemSecondaryAction>
                          <Tooltip title="Subir">
                            <span>
                              <IconButton
                                size="small"
                                disabled={folderIndex <= 0}
                                onClick={() => void handleMoveFolder(folder.id, -1)}
                              >
                                <ArrowUpwardIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Bajar">
                            <span>
                              <IconButton
                                size="small"
                                disabled={folderIndex < 0 || folderIndex >= sortedFolders.length - 1}
                                onClick={() => void handleMoveFolder(folder.id, 1)}
                              >
                                <ArrowDownwardIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title="Renombrar">
                            <IconButton size="small" onClick={() => handleStartEditFolder(folder)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Eliminar carpeta (los tags quedan en la raíz)">
                            <IconButton size="small" onClick={() => void handleDeleteFolder(folder.id)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </ListItemSecondaryAction>
                      </>
                    )}
                  </ListItem>
                  <Collapse in={expanded} timeout="auto" unmountOnExit>
                    {item.tags.length === 0 ? (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pl: 5, py: 0.75 }}>
                        Carpeta vacía — asigna tags al editarlos o al crearlos
                      </Typography>
                    ) : (
                      item.tags.map((tag) => renderTagRow(tag, true))
                    )}
                  </Collapse>
                </Box>
              );
            })}
          </List>
        )}

        <TagColorPickerPopover
          open={Boolean(colorAnchor)}
          anchorEl={colorAnchor}
          value={colorTarget === 'new' ? newColor : editColor}
          onChange={handleColorSelect}
          onClose={() => setColorAnchor(null)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TagManagerDialog;
