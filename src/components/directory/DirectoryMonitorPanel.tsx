import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CallMergeIcon from '@mui/icons-material/CallMerge';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import RuleIcon from '@mui/icons-material/Rule';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
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
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import DirectoryAISuggestionsPanel from '@/components/directory/DirectoryAISuggestionsPanel';
import DirectoryEditDialog from '@/components/directory/DirectoryEditDialog';
import DirectoryEntryDrawer from '@/components/directory/DirectoryEntryDrawer';
import { directoryMonitorService } from '@/services/directoryMonitorService';
import type {
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

const DUPLICATE_TYPES: DirectoryIssueType[] = ['duplicate_phone', 'duplicate_email', 'duplicate_name'];

const SEARCH_DEBOUNCE_MS = 400;

export interface DirectoryMonitorPanelProps {
  /** Se invoca tras fusionar/editar para refrescar el listado principal del directorio. */
  onDirectoryChanged?: () => void;
}

const DirectoryMonitorPanel: React.FC<DirectoryMonitorPanelProps> = ({ onDirectoryChanged }) => {
  const [view, setView] = useState<'issues' | 'ai'>('issues');
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

  const notify = (message: string, severity: 'success' | 'error') =>
    setSnackbar({ open: true, message, severity });

  const fetchStats = useCallback(async () => {
    try {
      setStats(await directoryMonitorService.getIssueStats());
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

  const totalPages = Math.ceil(totalCount / rowsPerPage);
  const from = totalCount === 0 ? 0 : page * rowsPerPage + 1;
  const to = Math.min((page + 1) * rowsPerPage, totalCount);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Monitoreo del contacto
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Inconsistencias detectadas por el orquestador para revisión humana.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={view}
            onChange={(_, next) => next && setView(next)}
          >
            <ToggleButton value="issues">
              <RuleIcon fontSize="small" sx={{ mr: 0.5 }} />
              Inconsistencias
            </ToggleButton>
            <ToggleButton value="ai">
              <AutoAwesomeIcon fontSize="small" sx={{ mr: 0.5 }} />
              Sugerencias IA
            </ToggleButton>
          </ToggleButtonGroup>
          {view === 'issues' && (
            <Button startIcon={<RefreshIcon />} size="small" onClick={refreshAll}>
              Actualizar
            </Button>
          )}
        </Stack>
      </Stack>

      {view === 'ai' ? (
        <DirectoryAISuggestionsPanel onDirectoryChanged={onDirectoryChanged} />
      ) : (
        <>
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
        </>
      )}
    </Box>
  );
};

export default DirectoryMonitorPanel;
