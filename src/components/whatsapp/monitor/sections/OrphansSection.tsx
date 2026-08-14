import React, { useState } from 'react';
import {
  Box, Stack, Typography, Collapse, IconButton, List, ListItem, ListItemText, Chip,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Checkbox,
  FormControlLabel, CircularProgress,
} from '@mui/material';
import { LinkOff as OrphanIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon } from '@mui/icons-material';
import BentoCard from '../ui/BentoCard';
import {
  deleteStorageOrphans,
  DELETE_STORAGE_ORPHANS_CONFIRM,
  type StorageSuggestion,
} from '@/services/monitorService';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

interface OrphansSectionProps {
  suggestions: StorageSuggestion[];
  onRefresh: () => void;
}

const OrphansSection: React.FC<OrphansSectionProps> = ({ suggestions, onRefresh }) => {
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    objectsAffected: number;
    bytesFreed: number;
    skippedReferenced: number;
    previewPaths: string[];
  } | null>(null);
  const orphanSuggestion = suggestions.find((s) => s.id === 'orphan_objects');
  if (!orphanSuggestion) return null;

  const openPreview = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await deleteStorageOrphans({ dryRun: true });
      setPreview({
        objectsAffected: result.objectsAffected,
        bytesFreed: result.bytesFreed,
        skippedReferenced: result.skippedReferenced,
        previewPaths: result.previewPaths ?? [],
      });
      setConfirmed(false);
      setDialogOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error analizando huérfanos');
    } finally {
      setLoading(false);
    }
  };

  const executePurge = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await deleteStorageOrphans({
        dryRun: false,
        confirmPhrase: DELETE_STORAGE_ORPHANS_CONFIRM,
      });
      if (result.objectsAffected === 0) {
        setError('No había huérfanos seguros para borrar. Reconcilia el índice si aún ves avisos.');
      } else {
        setSuccess(`Se eliminaron ${result.objectsAffected} huérfanos (${formatBytes(result.bytesFreed)}).`);
      }
      setDialogOpen(false);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error purgando huérfanos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <BentoCard sx={{ height: '100%' }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ cursor: 'pointer' }}
        onClick={() => setOpen(!open)}
      >
        <OrphanIcon color="warning" />
        <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
          Objetos huérfanos
        </Typography>
        <Chip label="warning" size="small" color="warning" variant="outlined" />
        <IconButton size="small">
          {open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Stack>
      <Collapse in={open}>
        <Box sx={{ mt: 1.5 }}>
          {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 1 }}>{success}</Alert>}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {orphanSuggestion.message}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            Primero reconcilia el índice para archivos que sí tienen mensaje.
            La purga solo borra objetos sin índice y sin referencia en message_log.
          </Typography>
          <List dense>
            <ListItem disablePadding>
              <ListItemText
                primary="Storage sin índice DB"
                secondary="Objetos en bucket sin fila en whatsapp_media_assets"
              />
            </ListItem>
            <ListItem disablePadding>
              <ListItemText
                primary="DB sin objeto Storage"
                secondary="Filas en whatsapp_media_assets cuyo archivo ya no existe"
              />
            </ListItem>
          </List>
          <Button
            size="small"
            variant="outlined"
            color="warning"
            onClick={(e) => { e.stopPropagation(); void openPreview(); }}
            disabled={loading}
            startIcon={loading ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            Purgar huérfanos seguros
          </Button>
        </Box>
      </Collapse>

      <Dialog open={dialogOpen} onClose={() => !loading && setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Purgar huérfanos seguros</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Se eliminarían <strong>{preview?.objectsAffected ?? 0}</strong> archivos
            ({formatBytes(preview?.bytesFreed ?? 0)}).
            Se omiten <strong>{preview?.skippedReferenced ?? 0}</strong> con referencia en un mensaje.
          </Alert>
          {preview?.previewPaths && preview.previewPaths.length > 0 && (
            <List dense>
              {preview.previewPaths.slice(0, 8).map((path) => (
                <ListItem key={path} disablePadding>
                  <ListItemText
                    primary={path}
                    primaryTypographyProps={{ variant: 'caption', fontFamily: 'monospace' }}
                  />
                </ListItem>
              ))}
            </List>
          )}
          <FormControlLabel
            control={<Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />}
            label="Entiendo que no se puede deshacer"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={loading}>Cancelar</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => void executePurge()}
            disabled={loading || !confirmed || (preview?.objectsAffected ?? 0) === 0}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {loading ? 'Eliminando...' : 'Eliminar huérfanos'}
          </Button>
        </DialogActions>
      </Dialog>
    </BentoCard>
  );
};

export default OrphansSection;
