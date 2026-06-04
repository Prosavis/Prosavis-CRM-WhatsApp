import AddIcon from '@mui/icons-material/Add';
import FilterListIcon from '@mui/icons-material/FilterList';
import PeopleIcon from '@mui/icons-material/People';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
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
import TableSortLabel from '@mui/material/TableSortLabel';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { directoryService } from '@/services/directoryService';
import type { DirectoryEntry, DirectorySource } from '@/types/lead';

const CLASSIFICATION_CHIP_COLORS: Record<string, 'default' | 'primary' | 'info' | 'warning'> = {
  user: 'primary',
  company: 'info',
  lead: 'warning',
  unknown: 'default',
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  user: 'Usuario',
  company: 'Empresa',
  lead: 'Lead',
  unknown: 'Desconocido',
};

const STATUS_CHIP_COLORS: Record<string, 'default' | 'success' | 'error' | 'warning'> = {
  active: 'success',
  inactive: 'default',
  opt_out: 'error',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
  opt_out: 'Opt-out',
};

const SOURCE_LABELS: Record<string, string> = {
  APP_USER: 'App User',
  WHATSAPP_INBOUND: 'WhatsApp Inbound',
  META_ADS: 'Meta Ads',
  REFERIDO: 'Referido',
  ORGANICO: 'Orgánico',
  BROADCAST: 'Broadcast',
  PANEL: 'Panel',
};

const CHANNEL_COLORS: Record<string, 'primary' | 'success'> = {
  WHATSAPP: 'primary',
  IN_APP: 'success',
};

interface DirectoryStats {
  total: number;
  active: number;
  inactive: number;
  optOut: number;
  byClassification: Record<string, number>;
  bySource: Record<string, number>;
}

type SortField = 'full_name' | 'email' | 'status' | 'source' | 'messages_count' | 'classification';
type SortDirection = 'asc' | 'desc';

const SEARCH_DEBOUNCE_MS = 400;

export interface LeadsPageProps {
  /** Cuando es true, se omite el título principal (p. ej. dentro de WhatsApp Cloud). */
  embedded?: boolean;
  onOpenInInbox?: (phone: string, name?: string) => void;
}

const LeadsPage: React.FC<LeadsPageProps> = ({ embedded = false, onOpenInInbox }) => {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [classificationFilter, setClassificationFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<DirectoryStats>({
    total: 0,
    active: 0,
    inactive: 0,
    optOut: 0,
    byClassification: {},
    bySource: {},
  });

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [newEntry, setNewEntry] = useState({
    phone: '',
    fullName: '',
    email: '',
    source: 'PANEL' as string,
  });

  const fetchStats = useCallback(async () => {
    try {
      const result = await directoryService.getStats();
      setStats(result);
    } catch {
      // Stats fallback silencioso
    }
  }, []);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, unknown> = {
        limit: rowsPerPage,
        page,
      };
      if (statusFilter) filters.status = statusFilter;
      if (classificationFilter) filters.classification = classificationFilter;
      if (sourceFilter) filters.source = sourceFilter;
      if (searchTerm) filters.searchTerm = searchTerm;
      if (sortField) {
        filters.sortField = sortField;
        filters.sortDirection = sortDirection;
      }

      const result = await directoryService.getEntries(filters as Parameters<typeof directoryService.getEntries>[0]);
      setEntries(result.entries);
      setTotalCount(result.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el directorio');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, classificationFilter, sourceFilter, page, rowsPerPage, searchTerm, sortField, sortDirection]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleCreateEntry = async () => {
    try {
      await directoryService.createEntry({
        fullName: newEntry.fullName || newEntry.phone || 'Sin nombre',
        phone: newEntry.phone || undefined,
        email: newEntry.email || undefined,
        source: (newEntry.source || 'PANEL') as DirectorySource,
        classification: 'lead',
        status: 'active',
        channels: ['WHATSAPP'],
      });
      setSnackbar({ open: true, message: 'Entrada creada exitosamente en el directorio', severity: 'success' });
      setCreateDialogOpen(false);
      setNewEntry({ phone: '', fullName: '', email: '', source: 'PANEL' });
      fetchEntries();
      fetchStats();
    } catch {
      setSnackbar({ open: true, message: 'Error al crear entrada', severity: 'error' });
    }
  };

  const handleSeedAllUsers = async () => {
    setSeedLoading(true);
    try {
      const result = await directoryService.seedAllUsersAsEntries();
      setSnackbar({
        open: true,
        message: `Seed completado: ${result.created} creados, ${result.skipped} omitidos, ${result.errors} errores`,
        severity: result.errors > 0 ? 'error' : 'success',
      });
      fetchEntries();
      fetchStats();
    } catch {
      setSnackbar({ open: true, message: 'Error al ejecutar seed', severity: 'error' });
    } finally {
      setSeedLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    setPage(0);
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField(null);
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection(field === 'messages_count' ? 'desc' : 'asc');
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchTerm(value.trim());
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map((e) => e.id)));
    }
  };

  const selectedEntries = entries.filter((e) => selectedIds.has(e.id));

  const totalPages = Math.ceil(totalCount / rowsPerPage);

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value - 1);
  };

  const kpis = [
    { label: 'Total', value: stats.total, color: 'primary.main' },
    { label: 'Activos', value: stats.active, color: 'success.main' },
    { label: 'Inactivos', value: stats.inactive, color: 'text.secondary' },
    { label: 'Opt-out', value: stats.optOut, color: 'error.main' },
  ];

  const from = totalCount === 0 ? 0 : page * rowsPerPage + 1;
  const to = Math.min((page + 1) * rowsPerPage, totalCount);

  return (
    <Box sx={{ p: embedded ? 0 : { xs: 1, sm: 2, md: 3 } }}>
      <Stack
        direction="row"
        justifyContent={embedded ? 'flex-end' : 'space-between'}
        alignItems="center"
        mb={embedded ? 2 : 3}
      >
        {!embedded && (
          <Typography variant="h4" fontWeight={700}>
            Directorio
          </Typography>
        )}
        <Stack direction="row" spacing={1}>
          {onOpenInInbox && selectedEntries.length > 0 && (
            <Button
              variant="outlined"
              color="success"
              startIcon={<WhatsAppIcon />}
              size="small"
              onClick={() => {
                const first = selectedEntries.find((e) => e.phone && e.status !== 'opt_out');
                if (first?.phone) {
                  onOpenInInbox(first.phone, first.fullName || undefined);
                  setSelectedIds(new Set());
                }
              }}
            >
              Abrir en inbox ({selectedEntries.filter((e) => e.phone && e.status !== 'opt_out').length})
            </Button>
          )}
          <Tooltip title="Seed: convertir todos los usuarios de la app al directorio">
            <Button
              variant="outlined"
              startIcon={seedLoading ? <CircularProgress size={18} /> : <AddIcon />}
              onClick={handleSeedAllUsers}
              disabled={seedLoading}
              size="small"
            >
              Seed
            </Button>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            size="small"
          >
            Nueva entrada
          </Button>
        </Stack>
      </Stack>

      <Grid container spacing={2} mb={3}>
        {kpis.map((kpi) => (
          <Grid item xs={6} sm={4} md={3} key={kpi.label}>
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 1.5 }}>
                <Typography variant="h5" fontWeight={700} color={kpi.color}>
                  {kpi.value}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {kpi.label}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

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
          <FilterListIcon color="action" />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Estado</InputLabel>
            <Select
              value={statusFilter}
              label="Estado"
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="active">Activo</MenuItem>
              <MenuItem value="inactive">Inactivo</MenuItem>
              <MenuItem value="opt_out">Opt-out</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Clasificación</InputLabel>
            <Select
              value={classificationFilter}
              label="Clasificación"
              onChange={(e) => {
                setClassificationFilter(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">Todas</MenuItem>
              <MenuItem value="user">Usuario</MenuItem>
              <MenuItem value="company">Empresa</MenuItem>
              <MenuItem value="lead">Lead</MenuItem>
              <MenuItem value="unknown">Desconocido</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Fuente</InputLabel>
            <Select
              value={sourceFilter}
              label="Fuente"
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">Todas</MenuItem>
              <MenuItem value="APP_USER">App User</MenuItem>
              <MenuItem value="WHATSAPP_INBOUND">WhatsApp Inbound</MenuItem>
              <MenuItem value="META_ADS">Meta Ads</MenuItem>
              <MenuItem value="PANEL">Panel</MenuItem>
              <MenuItem value="REFERIDO">Referido</MenuItem>
              <MenuItem value="ORGANICO">Orgánico</MenuItem>
              <MenuItem value="BROADCAST">Broadcast</MenuItem>
            </Select>
          </FormControl>
          <IconButton onClick={() => { fetchEntries(); fetchStats(); }}>
            <RefreshIcon />
          </IconButton>
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
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={selectedIds.size > 0 && selectedIds.size < entries.length}
                      checked={entries.length > 0 && selectedIds.size === entries.length}
                      onChange={toggleSelectAll}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortField === 'full_name'}
                      direction={sortField === 'full_name' ? sortDirection : 'asc'}
                      onClick={() => handleSort('full_name')}
                    >
                      Cliente
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Teléfono</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortField === 'classification'}
                      direction={sortField === 'classification' ? sortDirection : 'asc'}
                      onClick={() => handleSort('classification')}
                    >
                      Clasificación
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortField === 'source'}
                      direction={sortField === 'source' ? sortDirection : 'asc'}
                      onClick={() => handleSort('source')}
                    >
                      Fuente
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortField === 'status'}
                      direction={sortField === 'status' ? sortDirection : 'asc'}
                      onClick={() => handleSort('status')}
                    >
                      Estado
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Canales</TableCell>
                  <TableCell>Secuencia</TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={sortField === 'messages_count'}
                      direction={sortField === 'messages_count' ? sortDirection : 'desc'}
                      onClick={() => handleSort('messages_count')}
                    >
                      Mensajes
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Último contacto</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} align="center">
                      <Stack alignItems="center" spacing={1} py={4}>
                        <PeopleIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                        <Typography color="text.secondary">
                          {searchTerm ? 'No se encontraron resultados en el directorio' : 'No hay entradas en el directorio'}
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((entry) => (
                    <TableRow key={entry.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedIds.has(entry.id)}
                          onChange={() => toggleSelect(entry.id)}
                          size="small"
                          disabled={!entry.phone || entry.status === 'opt_out'}
                        />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box
                            sx={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              bgcolor: 'primary.light',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              flexShrink: 0,
                              overflow: 'hidden',
                            }}
                          >
                            {entry.photoUrl ? (
                              <Box component="img" src={entry.photoUrl} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              (entry.fullName?.charAt(0) || '?').toUpperCase()
                            )}
                          </Box>
                          <Typography variant="body2" fontWeight={500}>
                            {entry.fullName || '—'}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                          {entry.phone || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{entry.email || '—'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={CLASSIFICATION_LABELS[entry.classification] || entry.classification}
                          color={CLASSIFICATION_CHIP_COLORS[entry.classification] || 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={SOURCE_LABELS[entry.source as string] || entry.source || '—'}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={STATUS_LABELS[entry.status] || entry.status}
                          color={STATUS_CHIP_COLORS[entry.status] || 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          {entry.channels?.map((ch) => (
                            <Chip
                              key={ch}
                              label={ch}
                              size="small"
                              variant="outlined"
                              color={CHANNEL_COLORS[ch] || 'default'}
                            />
                          ))}
                          {(!entry.channels || entry.channels.length === 0) && '—'}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {entry.activeSequence !== 'NINGUNA' ? (
                          <Chip
                            label={`${entry.activeSequence} (${entry.sequenceStep})`}
                            size="small"
                            color="info"
                            variant="outlined"
                          />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{entry.messagesCount}</TableCell>
                      <TableCell>
                        {entry.lastContactAt
                          ? new Date(entry.lastContactAt).toLocaleDateString('es-CO', {
                              day: '2-digit',
                              month: 'short',
                            })
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))
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
            <FormControl size="small" sx={{ minWidth: 180 }}>
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
              </Select>
            </FormControl>

            <Stack alignItems="center" spacing={0.5}>
              <Pagination
                count={totalPages}
                page={page + 1}
                onChange={handlePageChange}
                color="primary"
                shape="rounded"
                showFirstButton
                showLastButton
                siblingCount={2}
                boundaryCount={1}
              />
              <Typography variant="caption" color="text.secondary">
                {from}–{to} de {totalCount} entradas
              </Typography>
            </Stack>
          </Box>
        </Paper>
      )}

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nueva entrada en el directorio</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Nombre completo"
              value={newEntry.fullName}
              onChange={(e) => setNewEntry({ ...newEntry, fullName: e.target.value })}
              fullWidth
            />
            <TextField
              label="Teléfono"
              value={newEntry.phone}
              onChange={(e) => setNewEntry({ ...newEntry, phone: e.target.value })}
              fullWidth
              placeholder="+57..."
            />
            <TextField
              label="Email"
              value={newEntry.email}
              onChange={(e) => setNewEntry({ ...newEntry, email: e.target.value })}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Fuente</InputLabel>
              <Select
                value={newEntry.source}
                label="Fuente"
                onChange={(e) => setNewEntry({ ...newEntry, source: e.target.value })}
              >
                <MenuItem value="PANEL">Panel</MenuItem>
                <MenuItem value="META_ADS">Meta Ads</MenuItem>
                <MenuItem value="REFERIDO">Referido</MenuItem>
                <MenuItem value="ORGANICO">Orgánico</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreateEntry}>
            Crear
          </Button>
        </DialogActions>
      </Dialog>

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

export default LeadsPage;
