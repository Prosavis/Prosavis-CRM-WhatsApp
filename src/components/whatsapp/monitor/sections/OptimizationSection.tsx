import React, { useState } from 'react';
import {
  Stack, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, Alert, CircularProgress, Checkbox, FormControlLabel, List, ListItem, ListItemText,
} from '@mui/material';
import { Tune as TuneIcon, Sync as SyncIcon, PictureAsPdf as PdfIcon } from '@mui/icons-material';
import BentoCard from '../ui/BentoCard';
import {
  analyzeStorage,
  optimizeDuplicatePdfs,
  optimizeStaleCatalogPdfs,
  backfillMediaMetadata,
  OPTIMIZE_DUPLICATE_PDFS_CONFIRM,
  OPTIMIZE_STALE_CATALOG_CONFIRM,
} from '@/services/monitorService';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

type OptimizeAction = 'duplicate_pdfs' | 'stale_catalog' | 'backfill' | null;

interface OptimizationSectionProps {
  onComplete: () => void;
}

const OptimizationSection: React.FC<OptimizationSectionProps> = ({ onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [action, setAction] = useState<OptimizeAction>(null);
  const [preview, setPreview] = useState<{
    bytesReclaimable?: number;
    redundantCopies?: number;
    uniquePdfGroups?: number;
    candidates?: number;
    previewPaths?: string[];
    message?: string;
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await analyzeStorage();
      setPreview({
        bytesReclaimable: result.preview.bytesReclaimable,
        redundantCopies: result.preview.redundantCopies,
        uniquePdfGroups: result.preview.uniquePdfGroups,
        message: `Análisis: ${result.preview.uniquePdfGroups} grupos PDF, ${result.orphans.storage_orphan_count} huérfanos en Storage.`,
      });
      setAction(null);
      setDialogOpen(true);
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error en análisis');
    } finally {
      setLoading(false);
    }
  };

  const openOptimize = async (next: OptimizeAction) => {
    setLoading(true);
    setError(null);
    try {
      if (next === 'duplicate_pdfs') {
        const result = await optimizeDuplicatePdfs({ dryRun: true });
        setPreview({
          bytesReclaimable: (result as { bytesFreed?: number }).bytesFreed,
          redundantCopies: (result as { objectsAffected?: number }).objectsAffected,
          uniquePdfGroups: (result as { uniquePdfGroups?: number }).uniquePdfGroups,
          previewPaths: (result as { previewPaths?: string[] }).previewPaths,
        });
      } else if (next === 'stale_catalog') {
        const result = await optimizeStaleCatalogPdfs({ dryRun: true });
        setPreview({
          bytesReclaimable: (result as { bytesFreed?: number }).bytesFreed,
          redundantCopies: (result as { objectsAffected?: number }).objectsAffected,
          previewPaths: (result as { previewPaths?: string[] }).previewPaths,
        });
      } else if (next === 'backfill') {
        const result = await backfillMediaMetadata({ dryRun: true });
        const sizeBackfill = (result as { sizeBackfill?: { candidates?: number } }).sizeBackfill;
        setPreview({
          candidates: sizeBackfill?.candidates ?? 0,
          message: `${sizeBackfill?.candidates ?? 0} assets con size_bytes desincronizado.`,
        });
      }
      setAction(next);
      setDialogOpen(true);
      setConfirmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error en preview');
    } finally {
      setLoading(false);
    }
  };

  const execute = async () => {
    if (!action) return;
    setLoading(true);
    setError(null);
    try {
      if (action === 'duplicate_pdfs') {
        await optimizeDuplicatePdfs({ dryRun: false, confirmPhrase: OPTIMIZE_DUPLICATE_PDFS_CONFIRM });
      } else if (action === 'stale_catalog') {
        await optimizeStaleCatalogPdfs({ dryRun: false, confirmPhrase: OPTIMIZE_STALE_CATALOG_CONFIRM });
      } else if (action === 'backfill') {
        await backfillMediaMetadata({ dryRun: false });
      }
      setDialogOpen(false);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error ejecutando optimización');
    } finally {
      setLoading(false);
    }
  };

  const dialogTitle = action === 'duplicate_pdfs'
    ? 'Limpiar PDFs duplicados'
    : action === 'stale_catalog'
      ? 'Limpiar catálogos PDF antiguos'
      : action === 'backfill'
        ? 'Sincronizar metadata'
        : 'Análisis de espacio';

  return (
    <>
      <BentoCard>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <TuneIcon color="primary" />
          <Typography variant="subtitle2" fontWeight={600}>Optimización</Typography>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="outlined" onClick={runAnalyze} disabled={loading}>
            Analizar espacio
          </Button>
          <Button variant="outlined" startIcon={<PdfIcon />} onClick={() => openOptimize('duplicate_pdfs')} disabled={loading}>
            PDFs duplicados
          </Button>
          <Button variant="outlined" onClick={() => openOptimize('stale_catalog')} disabled={loading}>
            Catálogos antiguos
          </Button>
          <Button variant="outlined" startIcon={<SyncIcon />} onClick={() => openOptimize('backfill')} disabled={loading}>
            Sincronizar metadata
          </Button>
        </Stack>
      </BentoCard>

      <Dialog open={dialogOpen} onClose={() => !loading && setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{dialogTitle}</DialogTitle>
        <DialogContent>
          {preview?.message && <Alert severity="info" sx={{ mb: 2 }}>{preview.message}</Alert>}
          {action && action !== 'backfill' && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Se liberarían <strong>{formatBytes(preview?.bytesReclaimable ?? 0)}</strong> eliminando{' '}
              <strong>{preview?.redundantCopies ?? 0}</strong> copias redundantes.
            </Alert>
          )}
          {action === 'backfill' && (
            <Typography variant="body2" sx={{ mb: 2 }}>
              {preview?.candidates ?? 0} registros sincronizarán size_bytes desde Storage.
            </Typography>
          )}
          {preview?.previewPaths && preview.previewPaths.length > 0 && (
            <List dense>
              {preview.previewPaths.slice(0, 8).map((path) => (
                <ListItem key={path} disablePadding>
                  <ListItemText primary={path} primaryTypographyProps={{ variant: 'caption', fontFamily: 'monospace' }} />
                </ListItem>
              ))}
            </List>
          )}
          {action && (
            <FormControlLabel
              control={<Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />}
              label="Entiendo que no se puede deshacer"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={loading}>Cerrar</Button>
          {action && (
            <Button
              variant="contained"
              color="warning"
              onClick={execute}
              disabled={loading || !confirmed}
              startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
            >
              Confirmar
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default OptimizationSection;
