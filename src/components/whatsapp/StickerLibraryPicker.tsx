import React, { useCallback, useMemo, useRef, useState } from 'react';
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
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import {
  deleteWhatsAppSticker,
  manageWhatsAppStickerFolder,
  reorderWhatsAppStickers,
  updateWhatsAppSticker,
  type WhatsAppSticker,
  type WhatsAppStickerFolder,
} from '@/services/whatsappService';

const UNCATEGORIZED_ID = '__none__';

export interface StickerLibraryPickerProps {
  folders: WhatsAppStickerFolder[];
  stickers: WhatsAppSticker[];
  loading?: boolean;
  sending?: boolean;
  uploading?: boolean;
  onRefresh: () => Promise<void> | void;
  onUpload: (file: File, options: { name: string; folderId: string | null }) => Promise<void>;
  onSend: (sticker: WhatsAppSticker) => Promise<void>;
  onError: (message: string) => void;
}

const StickerLibraryPicker: React.FC<StickerLibraryPickerProps> = ({
  folders,
  stickers,
  loading = false,
  sending = false,
  uploading = false,
  onRefresh,
  onUpload,
  onSend,
  onError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string>(UNCATEGORIZED_ID);
  const [busy, setBusy] = useState(false);

  const [nameDialog, setNameDialog] = useState<{
    mode: 'sticker' | 'folder' | 'upload';
    title: string;
    initial: string;
    stickerId?: string;
    folderId?: string;
    pendingFile?: File;
  } | null>(null);
  const [nameValue, setNameValue] = useState('');

  const [deleteDialog, setDeleteDialog] = useState<{
    type: 'sticker' | 'folder';
    id: string;
    label: string;
  } | null>(null);

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [folders],
  );

  const folderStickers = useMemo(() => {
    const folderId = selectedFolderId === UNCATEGORIZED_ID ? null : selectedFolderId;
    return stickers
      .filter((s) => (s.folderId ?? null) === folderId)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [selectedFolderId, stickers]);

  const uncategorizedCount = useMemo(
    () => stickers.filter((s) => !s.folderId).length,
    [stickers],
  );

  const runBusy = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      try {
        await fn();
        await onRefresh();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'No se pudo completar la acción');
      } finally {
        setBusy(false);
      }
    },
    [onError, onRefresh],
  );

  const openNameDialog = useCallback(
    (dialog: NonNullable<typeof nameDialog>) => {
      setNameValue(dialog.initial);
      setNameDialog(dialog);
    },
    [],
  );

  const handleNameConfirm = useCallback(async () => {
    if (!nameDialog) return;
    const trimmed = nameValue.trim();
    if (!trimmed) return;

    if (nameDialog.mode === 'upload' && nameDialog.pendingFile) {
      const folderId = selectedFolderId === UNCATEGORIZED_ID ? null : selectedFolderId;
      setNameDialog(null);
      try {
        await onUpload(nameDialog.pendingFile, { name: trimmed, folderId });
        await onRefresh();
      } catch (err) {
        onError(err instanceof Error ? err.message : 'No se pudo subir el sticker');
      }
      return;
    }

    await runBusy(async () => {
      if (nameDialog.mode === 'sticker' && nameDialog.stickerId) {
        await updateWhatsAppSticker(nameDialog.stickerId, { name: trimmed });
      } else if (nameDialog.mode === 'folder') {
        if (nameDialog.folderId) {
          await manageWhatsAppStickerFolder({
            action: 'update',
            folderId: nameDialog.folderId,
            name: trimmed,
          });
        } else {
          await manageWhatsAppStickerFolder({ action: 'create', name: trimmed });
        }
      }
    });
    setNameDialog(null);
  }, [nameDialog, nameValue, onError, onRefresh, onUpload, runBusy, selectedFolderId]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteDialog) return;
    const current = deleteDialog;
    setDeleteDialog(null);
    await runBusy(async () => {
      if (current.type === 'sticker') {
        await deleteWhatsAppSticker(current.id);
      } else {
        await manageWhatsAppStickerFolder({ action: 'delete', folderId: current.id });
        if (selectedFolderId === current.id) setSelectedFolderId(UNCATEGORIZED_ID);
      }
    });
  }, [deleteDialog, runBusy, selectedFolderId]);

  const moveSticker = useCallback(
    async (stickerId: string, direction: -1 | 1) => {
      const ids = folderStickers.map((s) => s.id);
      const index = ids.indexOf(stickerId);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= ids.length) return;
      const reordered = [...ids];
      const [item] = reordered.splice(index, 1);
      reordered.splice(next, 0, item);
      const folderId = selectedFolderId === UNCATEGORIZED_ID ? null : selectedFolderId;
      await runBusy(async () => {
        await reorderWhatsAppStickers({ folderId, orderedIds: reordered });
      });
    },
    [folderStickers, runBusy, selectedFolderId],
  );

  const moveFolder = useCallback(
    async (folderId: string, direction: -1 | 1) => {
      const ids = sortedFolders.map((f) => f.id);
      const index = ids.indexOf(folderId);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= ids.length) return;
      const reordered = [...ids];
      const [item] = reordered.splice(index, 1);
      reordered.splice(next, 0, item);
      await runBusy(async () => {
        await manageWhatsAppStickerFolder({ action: 'reorder', orderedIds: reordered });
      });
    },
    [runBusy, sortedFolders],
  );

  const moveStickerToFolder = useCallback(
    async (stickerId: string, folderId: string | null) => {
      await runBusy(async () => {
        await updateWhatsAppSticker(stickerId, { folderId });
      });
    },
    [runBusy],
  );

  const disabled = busy || uploading || loading;

  return (
    <Box sx={{ p: 1.5, width: 360, maxWidth: '92vw' }}>
      <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.5, mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          Stickers del equipo
        </Typography>
        {loading && <CircularProgress size={16} />}
        <Tooltip title={editMode ? 'Listo' : 'Administrar'}>
          <IconButton
            size="small"
            color={editMode ? 'primary' : 'default'}
            onClick={() => setEditMode((v) => !v)}
            disabled={disabled && !editMode}
          >
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Nueva carpeta">
          <IconButton
            size="small"
            disabled={disabled}
            onClick={() =>
              openNameDialog({
                mode: 'folder',
                title: 'Nueva carpeta',
                initial: '',
              })
            }
          >
            <CreateNewFolderOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Subir .webp">
          <span>
            <IconButton
              size="small"
              disabled={disabled || uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadFileOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/webp,.webp"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            const defaultName = file.name.replace(/\.webp$/i, '').slice(0, 80) || 'Sticker';
            openNameDialog({
              mode: 'upload',
              title: 'Nombre del sticker',
              initial: defaultName,
              pendingFile: file,
            });
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.25 }}>
        <Chip
          size="small"
          icon={<FolderOpenOutlinedIcon />}
          label={`Sin carpeta (${uncategorizedCount})`}
          color={selectedFolderId === UNCATEGORIZED_ID ? 'primary' : 'default'}
          variant={selectedFolderId === UNCATEGORIZED_ID ? 'filled' : 'outlined'}
          onClick={() => setSelectedFolderId(UNCATEGORIZED_ID)}
        />
        {sortedFolders.map((folder) => (
          <Chip
            key={folder.id}
            size="small"
            label={`${folder.name} (${stickers.filter((s) => s.folderId === folder.id).length})`}
            color={selectedFolderId === folder.id ? 'primary' : 'default'}
            variant={selectedFolderId === folder.id ? 'filled' : 'outlined'}
            onClick={() => setSelectedFolderId(folder.id)}
            onDelete={
              editMode
                ? () =>
                    setDeleteDialog({
                      type: 'folder',
                      id: folder.id,
                      label: folder.name,
                    })
                : undefined
            }
            deleteIcon={editMode ? <DeleteOutlineIcon /> : undefined}
          />
        ))}
      </Box>

      {editMode && selectedFolderId !== UNCATEGORIZED_ID && (
        <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
          <Button
            size="small"
            startIcon={<DriveFileRenameOutlineIcon />}
            disabled={disabled}
            onClick={() => {
              const folder = sortedFolders.find((f) => f.id === selectedFolderId);
              if (!folder) return;
              openNameDialog({
                mode: 'folder',
                title: 'Renombrar carpeta',
                initial: folder.name,
                folderId: folder.id,
              });
            }}
          >
            Renombrar carpeta
          </Button>
          <IconButton
            size="small"
            disabled={disabled || sortedFolders[0]?.id === selectedFolderId}
            onClick={() => void moveFolder(selectedFolderId, -1)}
          >
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            disabled={
              disabled ||
              sortedFolders[sortedFolders.length - 1]?.id === selectedFolderId
            }
            onClick={() => void moveFolder(selectedFolderId, 1)}
          >
            <ArrowForwardIcon fontSize="small" />
          </IconButton>
        </Box>
      )}

      {folderStickers.length === 0 && !loading ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          {editMode
            ? 'Esta carpeta está vacía. Sube un sticker o muévelo desde otra carpeta.'
            : 'No hay stickers aquí todavía.'}
        </Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 1,
            gridTemplateColumns: 'repeat(3, 1fr)',
            maxHeight: 280,
            overflow: 'auto',
          }}
        >
          {folderStickers.map((sticker, index) => (
            <Box
              key={sticker.id}
              sx={{
                border: 1,
                borderColor: 'divider',
                borderRadius: 2,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <Button
                fullWidth
                disabled={sending || disabled}
                onClick={() => {
                  if (editMode) return;
                  void onSend(sticker);
                }}
                sx={{
                  alignItems: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  height: editMode ? 110 : 96,
                  justifyContent: 'center',
                  p: 0.5,
                  textTransform: 'none',
                }}
              >
                <Box
                  component="img"
                  src={sticker.downloadUrl}
                  alt={sticker.name}
                  sx={{ maxHeight: 64, maxWidth: 64, objectFit: 'contain' }}
                />
                <Typography
                  variant="caption"
                  noWrap
                  sx={{ maxWidth: '100%', mt: 0.5, px: 0.5 }}
                  title={sticker.name}
                >
                  {sticker.name}
                </Typography>
              </Button>

              {editMode && (
                <Box
                  sx={{
                    borderTop: 1,
                    borderColor: 'divider',
                    display: 'flex',
                    justifyContent: 'space-between',
                    px: 0.25,
                    py: 0.25,
                  }}
                >
                  <IconButton
                    size="small"
                    disabled={disabled || index === 0}
                    onClick={() => void moveSticker(sticker.id, -1)}
                  >
                    <ArrowBackIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    disabled={disabled}
                    onClick={() =>
                      openNameDialog({
                        mode: 'sticker',
                        title: 'Renombrar sticker',
                        initial: sticker.name,
                        stickerId: sticker.id,
                      })
                    }
                  >
                    <DriveFileRenameOutlineIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={disabled}
                    onClick={() =>
                      setDeleteDialog({
                        type: 'sticker',
                        id: sticker.id,
                        label: sticker.name,
                      })
                    }
                  >
                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    disabled={disabled || index === folderStickers.length - 1}
                    onClick={() => void moveSticker(sticker.id, 1)}
                  >
                    <ArrowForwardIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
              )}

              {editMode && sortedFolders.length > 0 && (
                <Box sx={{ borderTop: 1, borderColor: 'divider', px: 0.5, py: 0.5 }}>
                  <TextField
                    select
                    size="small"
                    fullWidth
                    label="Carpeta"
                    value={sticker.folderId ?? UNCATEGORIZED_ID}
                    disabled={disabled}
                    SelectProps={{ native: true }}
                    onChange={(event) => {
                      const value = event.target.value;
                      void moveStickerToFolder(
                        sticker.id,
                        value === UNCATEGORIZED_ID ? null : value,
                      );
                    }}
                    InputLabelProps={{ shrink: true }}
                  >
                    <option value={UNCATEGORIZED_ID}>Sin carpeta</option>
                    {sortedFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </TextField>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      {(uploading || busy) && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          {uploading ? 'Subiendo sticker...' : 'Guardando cambios...'}
        </Typography>
      )}

      <Dialog open={Boolean(nameDialog)} onClose={() => setNameDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>{nameDialog?.title}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Nombre"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            inputProps={{ maxLength: nameDialog?.mode === 'folder' ? 40 : 80 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleNameConfirm();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNameDialog(null)}>Cancelar</Button>
          <Button
            variant="contained"
            disabled={!nameValue.trim() || disabled}
            onClick={() => void handleNameConfirm()}
            startIcon={nameDialog?.mode === 'folder' && !nameDialog.folderId ? <AddIcon /> : undefined}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteDialog)} onClose={() => setDeleteDialog(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          {deleteDialog?.type === 'folder' ? 'Eliminar carpeta' : 'Eliminar sticker'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteDialog?.type === 'folder'
              ? `¿Eliminar la carpeta “${deleteDialog.label}”? Los stickers pasarán a “Sin carpeta”.`
              : `¿Eliminar “${deleteDialog?.label}” de forma permanente? Esta acción no se puede deshacer.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={() => void handleDeleteConfirm()}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default StickerLibraryPicker;
