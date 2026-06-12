import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import VisibilityIcon from '@mui/icons-material/Visibility';

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useState } from 'react';

import DirectoryEntryDrawer from '@/components/directory/DirectoryEntryDrawer';
import { directoryMonitorService } from '@/services/directoryMonitorService';
import type {
  AISuggestionStats,
  AISuggestionStatus,
  AISuggestionType,
  DirectoryAISuggestion,
  DirectoryEntry,
} from '@/types/lead';

interface CategoryMeta {
  type: AISuggestionType;
  label: string;
}

const SUGGESTION_CATEGORIES: CategoryMeta[] = [
  { type: 'name_cleanup', label: 'Nombre' },
  { type: 'phone_fix', label: 'Teléfono' },
  { type: 'tag_suggestion', label: 'Etiquetas' },
  { type: 'merge', label: 'Fusión' },
];

const SUGGESTION_LABELS: Record<AISuggestionType, string> = {
  name_cleanup: 'Limpiar nombre',
  phone_fix: 'Corregir teléfono',
  tag_suggestion: 'Sugerir etiquetas',
  merge: 'Fusionar duplicados',
  summary: 'Resumen',
};

export interface DirectoryAISuggestionsPanelProps {
  onDirectoryChanged?: () => void;
}

function renderCurrent(s: DirectoryAISuggestion): React.ReactNode {
  if (s.suggestionType === 'merge') return '—';
  const value = (s.currentValue as { value?: unknown }).value;
  if (Array.isArray(value)) return value.join(', ') || '—';
  return String(value ?? '') || '—';
}

function renderSuggested(s: DirectoryAISuggestion): React.ReactNode {
  if (s.suggestionType === 'merge') {
    const related = (s.suggestedValue as { related?: unknown }).related;
    const count = Array.isArray(related) ? related.length : s.relatedEntryIds.length;
    return `Fusionar ${count} duplicado(s)`;
  }
  const value = (s.suggestedValue as { value?: unknown }).value;
  if (Array.isArray(value)) {
    return (
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        {value.map((v) => (
          <Chip key={String(v)} label={String(v)} size="small" color="success" variant="outlined" />
        ))}
      </Stack>
    );
  }
  return String(value ?? '') || '—';
}

const DirectoryAISuggestionsPanel: React.FC<DirectoryAISuggestionsPanelProps> = ({ onDirectoryChanged }) => {
  const [stats, setStats] = useState<AISuggestionStats>({
    openTotal: 0,
    appliedTotal: 0,
    dismissedTotal: 0,
    byType: {},
  });
  const [summary, setSummary] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<DirectoryAISuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<AISuggestionType | null>(null);
  const [statusFilter, setStatusFilter] = useState<AISuggestionStatus>('open');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [drawerEntry, setDrawerEntry] = useState<DirectoryEntry | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const notify = (message: string, severity: 'success' | 'error') =>
    setSnackbar({ open: true, message, severity });

  const fetchStats = useCallback(async () => {
    try {
      setStats(await directoryMonitorService.getSuggestionStats());
      setSummary(await directoryMonitorService.getGlobalSummary());
    } catch {
      /* fallback silencioso */
    }
  }, []);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await directoryMonitorService.getSuggestions({
        suggestionType: typeFilter ?? undefined,
        status: statusFilter,
        page,
        limit: rowsPerPage,
      });
      setSuggestions(result.suggestions);
      setTotalCount(result.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar las sugerencias');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, page, rowsPerPage]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchSuggestions();
  }, [fetchSuggestions]);

  const refreshAll = useCallback(() => {
    fetchStats();
    fetchSuggestions();
  }, [fetchStats, fetchSuggestions]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setAnalyzeProgress('Analizando toda la tabla…');
    setError(null);
    try {
      const result = await directoryMonitorService.analyzeAllWithAI(undefined, (p) => {
        setAnalyzeProgress(
          p.remaining > 0
            ? `Analizando… ${p.createdTotal} sugerencia(s), quedan ${p.remaining}`
            : `Finalizando… ${p.createdTotal} sugerencia(s)`,
        );
        // Refresco ligero de contadores entre pasadas.
        fetchStats();
      });
      notify(
        `Análisis completo: ${result.created} sugerencia(s) sobre ${result.analyzed} inconsistencia(s)` +
          (result.model ? ` · modelo ${result.model}` : ''),
        'success',
      );
      refreshAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo ejecutar el análisis con IA', 'error');
    } finally {
      setAnalyzing(false);
      setAnalyzeProgress(null);
    }
  };

  const handleApply = async (s: DirectoryAISuggestion) => {
    setBusyId(s.id);
    try {
      await directoryMonitorService.applySuggestion(s);
      notify('Sugerencia aplicada', 'success');
      refreshAll();
      onDirectoryChanged?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo aplicar la sugerencia', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (s: DirectoryAISuggestion) => {
    setBusyId(s.id);
    try {
      await directoryMonitorService.dismissSuggestion(s.id);
      notify('Sugerencia descartada', 'success');
      refreshAll();
    } catch {
      notify('No se pudo descartar la sugerencia', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleSelectCategory = (type: AISuggestionType | null) => {
    setTypeFilter((prev) => (prev === type ? null : type));
    setPage(0);
  };

  const totalPages = Math.ceil(totalCount / rowsPerPage);
  const from = totalCount === 0 ? 0 : page * rowsPerPage + 1;
  const to = Math.min((page + 1) * rowsPerPage, totalCount);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Sugerencias de IA
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Gemini propone arreglos legibles. Nada se aplica sin tu aprobación.
          </Typography>
        </Box>
        <Stack alignItems={{ xs: 'flex-start', sm: 'flex-end' }} spacing={0.5}>
          <Button
            variant="contained"
            color="secondary"
            startIcon={analyzing ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? 'Analizando…' : 'Analizar toda la tabla con IA'}
          </Button>
          {analyzeProgress && (
            <Typography variant="caption" color="text.secondary">
              {analyzeProgress}
            </Typography>
          )}
        </Stack>
      </Stack>

      {summary && (
        <Alert severity="info" icon={<AutoAwesomeIcon />} sx={{ mb: 2 }}>
          <AlertTitle>Resumen de la IA</AlertTitle>
          {summary}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ flex: 1 }}>
            <Chip
              label={`Todas (${stats.openTotal})`}
              color={typeFilter === null ? 'primary' : 'default'}
              variant={typeFilter === null ? 'filled' : 'outlined'}
              onClick={() => handleSelectCategory(null)}
            />
            {SUGGESTION_CATEGORIES.map((cat) => {
              const count = stats.byType[cat.type] ?? 0;
              return (
                <Chip
                  key={cat.type}
                  label={`${cat.label} (${count})`}
                  color={typeFilter === cat.type ? 'primary' : 'default'}
                  variant={typeFilter === cat.type ? 'filled' : 'outlined'}
                  onClick={() => handleSelectCategory(cat.type)}
                  sx={{ opacity: count === 0 && typeFilter !== cat.type ? 0.55 : 1 }}
                />
              );
            })}
          </Stack>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Estado</InputLabel>
            <Select
              value={statusFilter}
              label="Estado"
              onChange={(e) => {
                setStatusFilter(e.target.value as AISuggestionStatus);
                setPage(0);
              }}
            >
              <MenuItem value="open">Pendientes</MenuItem>
              <MenuItem value="applied">Aplicadas</MenuItem>
              <MenuItem value="dismissed">Descartadas</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Contacto</TableCell>
                  <TableCell>Sugerencia</TableCell>
                  <TableCell>Actual</TableCell>
                  <TableCell>Propuesto</TableCell>
                  <TableCell align="center">Confianza</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {suggestions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Stack alignItems="center" spacing={1} py={4}>
                        <AutoAwesomeIcon sx={{ fontSize: 44, color: 'secondary.light' }} />
                        <Typography color="text.secondary">
                          {statusFilter === 'open'
                            ? 'No hay sugerencias pendientes. Ejecuta «Analizar con IA».'
                            : 'Sin resultados'}
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : (
                  suggestions.map((s) => {
                    const entry = s.entry;
                    const fallbackName = String((s.currentValue as { value?: unknown }).value ?? '');
                    const name = entry?.fullName || fallbackName || '—';
                    const confidencePct = s.confidence != null ? Math.round(s.confidence * 100) : null;
                    const isMerge = s.suggestionType === 'merge';
                    return (
                      <TableRow key={s.id} hover>
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>
                            {name}
                          </Typography>
                          {entry?.phone && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                              {entry.phone}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Tooltip title={s.reason ?? ''} disableHoverListener={!s.reason}>
                            <Chip label={SUGGESTION_LABELS[s.suggestionType]} size="small" variant="outlined" />
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {renderCurrent(s)}
                          </Typography>
                        </TableCell>
                        <TableCell>{renderSuggested(s)}</TableCell>
                        <TableCell align="center">
                          {confidencePct != null ? (
                            <Chip
                              label={`${confidencePct}%`}
                              size="small"
                              color={confidencePct >= 75 ? 'success' : confidencePct >= 50 ? 'warning' : 'default'}
                            />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip title="Ver ficha">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={!entry}
                                  onClick={() => entry && setDrawerEntry(entry)}
                                >
                                  <VisibilityIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            {statusFilter === 'open' && (
                              <>
                                <Tooltip title={isMerge ? 'Aplicar fusión' : 'Aplicar sugerencia'}>
                                  <span>
                                    <IconButton
                                      size="small"
                                      color={isMerge ? 'warning' : 'success'}
                                      disabled={busyId === s.id}
                                      onClick={() => handleApply(s)}
                                    >
                                      {busyId === s.id ? (
                                        <CircularProgress size={16} />
                                      ) : isMerge ? (
                                        <CallMergeIcon fontSize="small" />
                                      ) : (
                                        <CheckIcon fontSize="small" />
                                      )}
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                <Tooltip title="Descartar">
                                  <span>
                                    <IconButton size="small" disabled={busyId === s.id} onClick={() => handleDismiss(s)}>
                                      <CloseIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              </>
                            )}
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>

          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              py: 2,
              px: 2,
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Filas por página</InputLabel>
              <Select
                value={rowsPerPage}
                label="Filas por página"
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setPage(0);
                }}
              >
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={25}>25</MenuItem>
                <MenuItem value={50}>50</MenuItem>
                <MenuItem value={100}>100</MenuItem>
                <MenuItem value={200}>200</MenuItem>
              </Select>
            </FormControl>
            <Stack alignItems="center" spacing={0.5}>
              <Pagination
                count={totalPages}
                page={page + 1}
                onChange={(_, value) => setPage(value - 1)}
                color="primary"
                shape="rounded"
                showFirstButton
                showLastButton
                siblingCount={1}
              />
              <Typography variant="caption" color="text.secondary">
                {from}–{to} de {totalCount} sugerencias
              </Typography>
            </Stack>
          </Box>
        </Paper>
      )}

      {drawerEntry && (
        <DirectoryEntryDrawer
          open={!!drawerEntry}
          entry={drawerEntry}
          onClose={() => setDrawerEntry(null)}
          onEdit={() => setDrawerEntry(null)}
        />
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default DirectoryAISuggestionsPanel;
