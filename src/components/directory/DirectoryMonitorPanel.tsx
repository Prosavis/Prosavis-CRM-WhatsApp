import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import CheckIcon from '@mui/icons-material/Check';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import EditIcon from '@mui/icons-material/Edit';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import Paper from '@mui/material/Paper';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Select from '@mui/material/Select';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import DirectoryEditDialog from '@/components/directory/DirectoryEditDialog';
import DirectoryEntryDrawer from '@/components/directory/DirectoryEntryDrawer';
import { directoryMonitorService } from '@/services/directoryMonitorService';
import type {
  AISuggestionType,
  DirectoryAISuggestion,
  DirectoryEntry,
  DirectoryIssue,
  DirectoryIssueStats,
  DirectoryIssueStatus,
  DirectoryIssueType,
} from '@/types/lead';

interface CategoryMeta {
  type: DirectoryIssueType;
  label: string;
  description: string;
}

const ISSUE_CATEGORIES: CategoryMeta[] = [
  { type: 'missing_name', label: 'Sin nombre', description: 'Contacto sin nombre o con placeholder' },
  { type: 'invalid_name', label: 'Nombre inválido', description: 'Nombre de 1 carácter o solo símbolos/números' },
  { type: 'emoji_name', label: 'Con emojis', description: 'El nombre contiene emojis o pictogramas' },
  { type: 'name_wa_mismatch', label: 'Nombre WA ≠ CRM', description: 'El inbox muestra perfil WA o contact_name distinto del directorio' },
  { type: 'missing_phone', label: 'Sin teléfono', description: 'Contacto sin número de teléfono' },
  { type: 'invalid_phone', label: 'Teléfono inválido', description: 'El teléfono no normaliza a formato E.164' },
  { type: 'duplicate_phone', label: 'Duplicado (tel)', description: 'Mismo teléfono en varias entradas' },
  { type: 'duplicate_email', label: 'Duplicado (email)', description: 'Mismo email en varias entradas' },
  { type: 'duplicate_name', label: 'Duplicado (nombre)', description: 'Mismo nombre en varias entradas' },
];

const ISSUE_LABELS: Record<DirectoryIssueType, string> = ISSUE_CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.type]: c.label }),
  {} as Record<DirectoryIssueType, string>,
);

const SUGGESTION_LABELS: Record<AISuggestionType, string> = {
  name_cleanup: 'Limpiar nombre',
  phone_fix: 'Corregir teléfono',
  tag_suggestion: 'Sugerir etiquetas',
  merge: 'Fusionar duplicados',
  keep_separate: 'Personas diferentes',
  summary: 'Resumen',
};

const DUPLICATE_TYPES: DirectoryIssueType[] = ['duplicate_phone', 'duplicate_email', 'duplicate_name'];

const SEARCH_DEBOUNCE_MS = 400;

function renderSuggestionCurrent(s: DirectoryAISuggestion): React.ReactNode {
  if (s.suggestionType === 'merge' || s.suggestionType === 'keep_separate') return '—';
  const value = (s.currentValue as { value?: unknown }).value;
  if (Array.isArray(value)) return value.join(', ') || '—';
  return String(value ?? '') || '—';
}

function renderSuggestionProposed(s: DirectoryAISuggestion): React.ReactNode {
  if (s.suggestionType === 'merge') {
    const related = (s.suggestedValue as { related?: unknown }).related;
    const count = Array.isArray(related) ? related.length : s.relatedEntryIds.length;
    return `Fusionar ${count} duplicado(s) en la entrada principal`;
  }
  if (s.suggestionType === 'keep_separate') {
    const field = String((s.suggestedValue as { distinguishing_field?: unknown }).distinguishing_field ?? '').trim();
    return field
      ? `Marcar como personas diferentes (${field})`
      : 'Marcar como personas diferentes';
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

export interface DirectoryMonitorPanelProps {
  /** Se invoca tras fusionar/editar para refrescar el listado principal del directorio. */
  onDirectoryChanged?: () => void;
}

const DirectoryMonitorPanel: React.FC<DirectoryMonitorPanelProps> = ({ onDirectoryChanged }) => {
  const [stats, setStats] = useState<DirectoryIssueStats>({ openTotal: 0, dismissedTotal: 0, byType: {} });
  const [issues, setIssues] = useState<DirectoryIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<DirectoryIssueType | null>(null);
  const [statusFilter, setStatusFilter] = useState<DirectoryIssueStatus>('open');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const [drawerEntry, setDrawerEntry] = useState<DirectoryEntry | null>(null);
  const [editEntry, setEditEntry] = useState<DirectoryEntry | null>(null);

  const [mergeIssue, setMergeIssue] = useState<DirectoryIssue | null>(null);
  const [mergeGroup, setMergeGroup] = useState<DirectoryEntry[]>([]);
  const [mergeKeeperId, setMergeKeeperId] = useState<string>('');
  const [mergeLoading, setMergeLoading] = useState(false);

  // Análisis IA global
  const [summary, setSummary] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<string | null>(null);

  // Solución IA por fila
  const [aiRowBusyId, setAiRowBusyId] = useState<string | null>(null);
  const [previewSuggestion, setPreviewSuggestion] = useState<DirectoryAISuggestion | null>(null);
  const [previewIssue, setPreviewIssue] = useState<DirectoryIssue | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);

  const notify = (message: string, severity: 'success' | 'error') =>
    setSnackbar({ open: true, message, severity });

  const fetchStats = useCallback(async () => {
    try {
      setStats(await directoryMonitorService.getIssueStats());
      setSummary(await directoryMonitorService.getGlobalSummary());
    } catch {
      /* fallback silencioso */
    }
  }, []);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await directoryMonitorService.getIssues({
        issueType: typeFilter ?? undefined,
        status: statusFilter,
        search: searchTerm || undefined,
        page,
        limit: rowsPerPage,
      });
      setIssues(result.issues);
      setTotalCount(result.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el monitoreo');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, searchTerm, page, rowsPerPage]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchTerm(value.trim());
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleSelectCategory = (type: DirectoryIssueType | null) => {
    setTypeFilter((prev) => (prev === type ? null : type));
    setPage(0);
  };

  const refreshAll = useCallback(() => {
    fetchStats();
    fetchIssues();
  }, [fetchStats, fetchIssues]);

  const handleAnalyzeAll = async () => {
    setAnalyzing(true);
    setAnalyzeProgress('Analizando toda la tabla…');
    setError(null);
    try {
      const result = await directoryMonitorService.analyzeAllWithAI({ reanalyze: true }, (p) => {
        setAnalyzeProgress(
          p.remaining > 0
            ? `Analizando… ${p.createdTotal} sugerencia(s), quedan ${p.remaining}`
            : `Finalizando… ${p.createdTotal} sugerencia(s)`,
        );
      });
      if ((result.failedBatchesTotal ?? 0) > 0) {
        notify(
          `Análisis parcial: ${result.created} sugerencia(s); ${result.failedBatchesTotal} lote(s) fallaron.`,
          'error',
        );
      } else {
        notify(
          `Análisis completo: ${result.created} sugerencia(s) sobre ${result.analyzed} inconsistencia(s)` +
            (result.model ? ` · modelo ${result.model}` : ''),
          'success',
        );
      }
      refreshAll();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo ejecutar el análisis con IA', 'error');
    } finally {
      setAnalyzing(false);
      setAnalyzeProgress(null);
    }
  };

  const openPreview = (issue: DirectoryIssue, suggestion: DirectoryAISuggestion) => {
    setPreviewIssue(issue);
    setPreviewSuggestion(suggestion);
  };

  const closePreview = () => {
    setPreviewIssue(null);
    setPreviewSuggestion(null);
  };

  const handleSolveWithAI = async (issue: DirectoryIssue) => {
    if (issue.aiSuggestion) {
      openPreview(issue, issue.aiSuggestion);
      return;
    }
    if (!issue.entryId) {
      notify('La inconsistencia no tiene entrada asociada.', 'error');
      return;
    }
    setAiRowBusyId(issue.id);
    try {
      const suggestion = await directoryMonitorService.generateSuggestionForIssue(issue);
      if (suggestion) {
        openPreview(issue, suggestion);
      } else {
        notify('La IA no encontró una solución segura para esta fila.', 'error');
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo generar la solución con IA', 'error');
    } finally {
      setAiRowBusyId(null);
    }
  };

  const handleApplyPreview = async () => {
    if (!previewSuggestion) return;
    setApplyLoading(true);
    try {
      await directoryMonitorService.applySuggestion(previewSuggestion);
      notify('Solución aplicada', 'success');
      closePreview();
      refreshAll();
      onDirectoryChanged?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo aplicar la solución', 'error');
    } finally {
      setApplyLoading(false);
    }
  };

  const handleDismiss = async (issue: DirectoryIssue) => {
    try {
      await directoryMonitorService.dismissIssue(issue.id);
      notify('Inconsistencia descartada', 'success');
      refreshAll();
    } catch {
      notify('No se pudo descartar la inconsistencia', 'error');
    }
  };

  const openMergeDialog = async (issue: DirectoryIssue) => {
    setMergeIssue(issue);
    setMergeGroup([]);
    setMergeKeeperId('');
    try {
      const group = await directoryMonitorService.getDuplicateGroup(issue);
      setMergeGroup(group);
      setMergeKeeperId(issue.entryId ?? group[0]?.id ?? '');
    } catch {
      notify('No se pudo cargar el grupo de duplicados', 'error');
    }
  };

  const handleConfirmMerge = async () => {
    if (!mergeKeeperId || mergeGroup.length < 2) return;
    setMergeLoading(true);
    try {
      const duplicates = mergeGroup.filter((e) => e.id !== mergeKeeperId);
      for (const dup of duplicates) {
        await directoryMonitorService.mergeEntries(mergeKeeperId, dup.id);
      }
      notify(`Fusión completada (${duplicates.length} duplicado(s))`, 'success');
      setMergeIssue(null);
      setMergeGroup([]);
      refreshAll();
      onDirectoryChanged?.();
    } catch {
      notify('Error al fusionar las entradas', 'error');
    } finally {
      setMergeLoading(false);
    }
  };

  const handleUnifyOne = async (issue: DirectoryIssue) => {
    if (!issue.entryId) return;
    try {
      await directoryMonitorService.unifyContactNameFromDirectory(issue.entryId);
      notify('Nombre unificado desde CRM', 'success');
      refreshAll();
      onDirectoryChanged?.();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'No se pudo unificar el nombre', 'error');
    }
  };

  const totalPages = Math.ceil(totalCount / rowsPerPage);
  const from = totalCount === 0 ? 0 : page * rowsPerPage + 1;
  const to = Math.min((page + 1) * rowsPerPage, totalCount);

  const previewConfidencePct =
    previewSuggestion?.confidence != null ? Math.round(previewSuggestion.confidence * 100) : null;
  const previewIsKeepSeparate = previewSuggestion?.suggestionType === 'keep_separate';
  const previewDistinguishingField = previewIsKeepSeparate
    ? String((previewSuggestion?.suggestedValue as { distinguishing_field?: unknown }).distinguishing_field ?? '').trim()
    : '';

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Monitoreo del contacto
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Inconsistencias detectadas por el orquestador para revisión humana. Resuelve cada fila con IA bajo demanda.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button startIcon={<RefreshIcon />} size="small" onClick={refreshAll} disabled={analyzing}>
            Actualizar
          </Button>
          <Stack alignItems={{ xs: 'flex-start', sm: 'flex-end' }} spacing={0.25}>
            <Button
              size="small"
              variant="contained"
              color="secondary"
              startIcon={analyzing ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeIcon />}
              onClick={handleAnalyzeAll}
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
      </Stack>

      {summary && (
        <Alert severity="info" icon={<AutoAwesomeIcon />} sx={{ mb: 2 }}>
          <AlertTitle>Resumen de la IA</AlertTitle>
          {summary}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip
            label={`Todos (${stats.openTotal})`}
            color={typeFilter === null ? 'primary' : 'default'}
            variant={typeFilter === null ? 'filled' : 'outlined'}
            onClick={() => handleSelectCategory(null)}
          />
          {ISSUE_CATEGORIES.map((cat) => {
            const count = stats.byType[cat.type] ?? 0;
            return (
              <Tooltip key={cat.type} title={cat.description}>
                <Chip
                  label={`${cat.label} (${count})`}
                  color={typeFilter === cat.type ? 'primary' : 'default'}
                  variant={typeFilter === cat.type ? 'filled' : 'outlined'}
                  onClick={() => handleSelectCategory(cat.type)}
                  sx={{ opacity: count === 0 && typeFilter !== cat.type ? 0.55 : 1 }}
                />
              </Tooltip>
            );
          })}
        </Stack>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            placeholder="Buscar por nombre, teléfono o email…"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
            sx={{ minWidth: 260, flex: { xs: '1 1 100%', sm: '0 1 auto' } }}
          />
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Estado</InputLabel>
            <Select
              value={statusFilter}
              label="Estado"
              onChange={(e) => {
                setStatusFilter(e.target.value as DirectoryIssueStatus);
                setPage(0);
              }}
            >
              <MenuItem value="open">Abiertas</MenuItem>
              <MenuItem value="dismissed">Descartadas</MenuItem>
              <MenuItem value="resolved">Resueltas</MenuItem>
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
                  <TableCell>Teléfono</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Inconsistencia</TableCell>
                  <TableCell>Detectado</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {issues.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Stack alignItems="center" spacing={1} py={4}>
                        <DoneAllIcon sx={{ fontSize: 44, color: 'success.light' }} />
                        <Typography color="text.secondary">
                          {statusFilter === 'open'
                            ? 'No hay inconsistencias pendientes en esta categoría'
                            : 'Sin resultados'}
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : (
                  issues.map((issue) => {
                    const entry = issue.entry;
                    const isDuplicate = DUPLICATE_TYPES.includes(issue.issueType);
                    const dupCount = Number(issue.details?.count ?? issue.relatedEntryIds.length + 1);
                    const fallbackName = String(issue.details?.full_name ?? '') || '—';
                    const aiBusy = aiRowBusyId === issue.id;
                    const hasSuggestion = !!issue.aiSuggestion;
                    return (
                      <TableRow key={issue.id} hover>
                        <TableCell>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Box
                              sx={{
                                width: 30,
                                height: 30,
                                borderRadius: '50%',
                                bgcolor: 'primary.light',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'white',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                flexShrink: 0,
                                overflow: 'hidden',
                              }}
                            >
                              {entry?.photoUrl ? (
                                <Box
                                  component="img"
                                  src={entry.photoUrl}
                                  sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                              ) : (
                                ((entry?.fullName || fallbackName).charAt(0) || '?').toUpperCase()
                              )}
                            </Box>
                            <Typography variant="body2" fontWeight={500}>
                              {entry?.fullName || fallbackName}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                            {entry?.phone || String(issue.details?.phone_key ?? '') || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {entry?.email || String(issue.details?.email ?? '') || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Chip
                              label={
                                isDuplicate
                                  ? `${ISSUE_LABELS[issue.issueType]} · ${dupCount}`
                                  : ISSUE_LABELS[issue.issueType]
                              }
                              color={issue.severity === 'error' ? 'error' : 'warning'}
                              size="small"
                              variant="outlined"
                            />
                            {hasSuggestion && (
                              <Tooltip title="Hay una solución de IA lista para previsualizar">
                                <Chip
                                  icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
                                  label="IA"
                                  size="small"
                                  color="secondary"
                                  variant="outlined"
                                />
                              </Tooltip>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(issue.detectedAt).toLocaleDateString('es-CO', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            {statusFilter === 'open' && (
                              <Tooltip title="Solución con IA">
                                <span>
                                  <IconButton
                                    size="small"
                                    color="secondary"
                                    disabled={aiBusy || !issue.entryId}
                                    onClick={() => handleSolveWithAI(issue)}
                                  >
                                    {aiBusy ? (
                                      <CircularProgress size={16} color="inherit" />
                                    ) : (
                                      <AutoAwesomeIcon fontSize="small" />
                                    )}
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}
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
                            <Tooltip title="Editar">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={!entry}
                                  onClick={() => entry && setEditEntry(entry)}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            {issue.issueType === 'name_wa_mismatch' && statusFilter === 'open' && (
                              <Tooltip title="Unificar nombre CRM en WhatsApp">
                                <IconButton
                                  size="small"
                                  color="secondary"
                                  disabled={!issue.entryId}
                                  onClick={() => handleUnifyOne(issue)}
                                >
                                  <DoneAllIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {isDuplicate && (
                              <Tooltip title="Fusionar duplicados">
                                <IconButton size="small" color="warning" onClick={() => openMergeDialog(issue)}>
                                  <CallMergeIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {statusFilter === 'open' && (
                              <Tooltip title="Descartar">
                                <IconButton size="small" onClick={() => handleDismiss(issue)}>
                                  <DoneAllIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
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
                {from}–{to} de {totalCount} inconsistencias
              </Typography>
            </Stack>
          </Box>
        </Paper>
      )}

      <Dialog open={!!previewSuggestion} onClose={applyLoading ? undefined : closePreview} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <AutoAwesomeIcon color="secondary" fontSize="small" />
            <span>Solución propuesta por IA</span>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {previewSuggestion && (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Chip
                  label={SUGGESTION_LABELS[previewSuggestion.suggestionType]}
                  size="small"
                  color="secondary"
                  variant="outlined"
                />
                {previewConfidencePct != null && (
                  <Chip
                    label={`Confianza ${previewConfidencePct}%`}
                    size="small"
                    color={previewConfidencePct >= 75 ? 'success' : previewConfidencePct >= 50 ? 'warning' : 'default'}
                  />
                )}
              </Stack>

              {previewIssue?.entry && (
                <Typography variant="body2" color="text.secondary">
                  Contacto: <strong>{previewIssue.entry.fullName || '—'}</strong>
                  {previewIssue.entry.phone ? ` · ${previewIssue.entry.phone}` : ''}
                </Typography>
              )}

              {previewIsKeepSeparate ? (
                <Alert severity="info" icon={<PeopleAltIcon />}>
                  <AlertTitle>Son personas diferentes</AlertTitle>
                  {previewDistinguishingField
                    ? `La IA detectó datos diferenciadores: ${previewDistinguishingField}. `
                    : 'La IA detectó que comparten nombre pero difieren en sus identificadores. '}
                  Se marcarán como contactos independientes (no se fusionan) y la inconsistencia de duplicado quedará resuelta.
                </Alert>
              ) : (
                <Box>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Box flex={1}>
                      <Typography variant="caption" color="text.secondary">
                        Actual
                      </Typography>
                      <Typography variant="body2">{renderSuggestionCurrent(previewSuggestion)}</Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' } }} />
                    <Box flex={1}>
                      <Typography variant="caption" color="text.secondary">
                        Propuesto
                      </Typography>
                      <Box>{renderSuggestionProposed(previewSuggestion)}</Box>
                    </Box>
                  </Stack>
                </Box>
              )}

              {previewSuggestion.reason && (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Razón
                  </Typography>
                  <Typography variant="body2">{previewSuggestion.reason}</Typography>
                </Box>
              )}

              <Typography variant="caption" color="text.secondary">
                Nada se escribe en la base de datos hasta que confirmes.
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closePreview} disabled={applyLoading}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color={previewIsKeepSeparate ? 'secondary' : 'success'}
            startIcon={
              applyLoading ? (
                <CircularProgress size={16} color="inherit" />
              ) : previewIsKeepSeparate ? (
                <PeopleAltIcon />
              ) : (
                <CheckIcon />
              )
            }
            onClick={handleApplyPreview}
            disabled={applyLoading}
          >
            Aplicar solución
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!mergeIssue} onClose={() => setMergeIssue(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Fusionar duplicados</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Selecciona la entrada que se conservará. El resto se fusionará en ella y se eliminará.
          </Typography>
          {mergeGroup.length === 0 ? (
            <Box display="flex" justifyContent="center" py={3}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <RadioGroup value={mergeKeeperId} onChange={(e) => setMergeKeeperId(e.target.value)}>
              <Stack spacing={1}>
                {mergeGroup.map((e) => (
                  <Paper key={e.id} variant="outlined" sx={{ px: 1.5, py: 1 }}>
                    <FormControlLabel
                      value={e.id}
                      control={<Radio size="small" />}
                      label={
                        <Box>
                          <Typography variant="body2" fontWeight={600}>
                            {e.fullName || '—'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {[e.phone, e.email, e.source].filter(Boolean).join(' · ') || 'Sin datos'}
                          </Typography>
                        </Box>
                      }
                    />
                  </Paper>
                ))}
              </Stack>
            </RadioGroup>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMergeIssue(null)} disabled={mergeLoading}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="warning"
            startIcon={mergeLoading ? <CircularProgress size={16} /> : <CallMergeIcon />}
            onClick={handleConfirmMerge}
            disabled={mergeLoading || mergeGroup.length < 2 || !mergeKeeperId}
          >
            Fusionar
          </Button>
        </DialogActions>
      </Dialog>

      {drawerEntry && (
        <DirectoryEntryDrawer
          open={!!drawerEntry}
          entry={drawerEntry}
          onClose={() => setDrawerEntry(null)}
          onEdit={(entry) => {
            setDrawerEntry(null);
            setTimeout(() => setEditEntry(entry), 250);
          }}
        />
      )}

      {editEntry && (
        <DirectoryEditDialog
          open={!!editEntry}
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={() => {
            setEditEntry(null);
            refreshAll();
            onDirectoryChanged?.();
          }}
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

export default DirectoryMonitorPanel;
