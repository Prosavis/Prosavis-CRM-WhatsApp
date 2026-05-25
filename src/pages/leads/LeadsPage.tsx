import AddIcon from '@mui/icons-material/Add';
import FilterListIcon from '@mui/icons-material/FilterList';
import PeopleIcon from '@mui/icons-material/People';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import SyncIcon from '@mui/icons-material/Sync';
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
import { leadService } from '@/services/leadService';
import type { Lead, LeadSource, LeadStatus } from '@/types/lead';

const STATUS_COLORS: Record<LeadStatus, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
  PENDIENTE: 'warning',
  NO_AGENDO: 'default',
  AGENDADO: 'info',
  COMPLETADO: 'success',
  OPT_OUT: 'error',
  PAGO_RECHAZADO: 'error',
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  PENDIENTE: 'Pendiente',
  NO_AGENDO: 'No agendó',
  AGENDADO: 'Agendado',
  COMPLETADO: 'Completado',
  OPT_OUT: 'Opt-out',
  PAGO_RECHAZADO: 'Pago rechazado',
};

const SOURCE_LABELS: Record<LeadSource, string> = {
  META_ADS: 'Meta Ads',
  REFERIDO: 'Referido',
  ORGANICO: 'Orgánico',
  BROADCAST: 'Broadcast',
  WHATSAPP_INBOUND: 'WhatsApp Inbound',
  PANEL: 'Panel',
  APP_USER: 'App User',
};

interface LeadStats {
  total: number;
  pendientes: number;
  noAgendo: number;
  agendados: number;
  completados: number;
  optOut: number;
  pagoRechazado: number;
}

type SortField = 'name' | 'email' | 'status' | 'source' | 'mensajes_enviados';
type SortDirection = 'asc' | 'desc';

const SEARCH_DEBOUNCE_MS = 400;

export interface LeadsPageProps {
  /** Cuando es true, se omite el título principal (p. ej. dentro de WhatsApp Cloud). */
  embedded?: boolean;
  onOpenInInbox?: (phone: string, name?: string) => void;
}

const LeadsPage: React.FC<LeadsPageProps> = ({ embedded = false, onOpenInInbox }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(100);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<LeadStats>({
    total: 0,
    pendientes: 0,
    noAgendo: 0,
    agendados: 0,
    completados: 0,
    optOut: 0,
    pagoRechazado: 0,
  });

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [newLead, setNewLead] = useState({
    phone: '',
    name: '',
    email: '',
    source: 'PANEL' as LeadSource,
  });

  const fetchStats = useCallback(async () => {
    try {
      const result = await leadService.getLeadStats();
      setStats(result);
    } catch {
      // Stats fallback silencioso
    }
  }, []);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: Record<string, unknown> = {
        limit: rowsPerPage,
        page,
      };
      if (statusFilter) filters.status = statusFilter;
      if (sourceFilter) filters.source = sourceFilter;
      if (searchTerm) filters.searchTerm = searchTerm;
      if (sortField) {
        filters.sortField = sortField;
        filters.sortDirection = sortDirection;
      }

      const result = await leadService.getLeads(filters as Parameters<typeof leadService.getLeads>[0]);
      setLeads(result.leads);
      setTotalCount(result.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar leads');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, sourceFilter, page, rowsPerPage, searchTerm, sortField, sortDirection]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleCreateLead = async () => {
    try {
      await leadService.createLead({
        phone: newLead.phone || undefined,
        name: newLead.name || undefined,
        email: newLead.email || undefined,
        source: newLead.source,
      });
      setSnackbar({ open: true, message: 'Lead creado exitosamente', severity: 'success' });
      setCreateDialogOpen(false);
      setNewLead({ phone: '', name: '', email: '', source: 'PANEL' });
      fetchLeads();
      fetchStats();
    } catch {
      setSnackbar({ open: true, message: 'Error al crear lead', severity: 'error' });
    }
  };

  const handleSeedAllUsers = async () => {
    setSeedLoading(true);
    try {
      const result = await leadService.seedAllUsersAsLeads();
      setSnackbar({
        open: true,
        message: `Seed completado: ${result.created} creados, ${result.skipped} omitidos, ${result.errors} errores`,
        severity: result.errors > 0 ? 'error' : 'success',
      });
      fetchLeads();
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
      setSortDirection(field === 'mensajes_enviados' ? 'desc' : 'asc');
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
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map((l) => l.id)));
    }
  };

  const selectedLeads = leads.filter((l) => selectedIds.has(l.id));

  const totalPages = Math.ceil(totalCount / rowsPerPage);

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value - 1);
  };

  const kpis = [
    { label: 'Total', value: stats.total, color: 'primary.main' },
    { label: 'Pendientes', value: stats.pendientes, color: 'warning.main' },
    { label: 'Agendados', value: stats.agendados, color: 'info.main' },
    { label: 'Completados', value: stats.completados, color: 'success.main' },
    { label: 'Pago rechazado', value: stats.pagoRechazado, color: 'error.main' },
    { label: 'Opt-out', value: stats.optOut, color: 'error.main' },
  ];

  const from = totalCount === 0 ? 0 : page * rowsPerPage + 1;
  const to = Math.min((page + 1) * rowsPerPage, totalCount);

  const sortableColumns: { field: SortField; label: string }[] = [
    { field: 'name', label: 'Nombre' },
    { field: 'email', label: 'Email' },
    { field: 'status', label: 'Estado' },
    { field: 'source', label: 'Fuente' },
    { field: 'mensajes_enviados', label: 'Mensajes' },
  ];

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
            Leads
          </Typography>
        )}
        <Stack direction="row" spacing={1}>
          {onOpenInInbox && selectedLeads.length > 0 && (
            <Button
              variant="outlined"
              color="success"
              startIcon={<WhatsAppIcon />}
              size="small"
              onClick={() => {
                const first = selectedLeads.find((l) => l.phone && l.status !== 'OPT_OUT');
                if (first?.phone) {
                  onOpenInInbox(first.phone, first.name || undefined);
                  setSelectedIds(new Set());
                }
              }}
            >
              Abrir en inbox ({selectedLeads.filter((l) => l.phone && l.status !== 'OPT_OUT').length})
            </Button>
          )}
          <Tooltip title="Seed: convertir todos los usuarios a leads">
            <Button
              variant="outlined"
              startIcon={seedLoading ? <CircularProgress size={18} /> : <SyncIcon />}
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
            Nuevo Lead
          </Button>
        </Stack>
      </Stack>

      <Grid container spacing={2} mb={3}>
        {kpis.map((kpi) => (
          <Grid item xs={6} sm={4} md={2} key={kpi.label}>
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
              <MenuItem value="PENDIENTE">Pendiente</MenuItem>
              <MenuItem value="NO_AGENDO">No agendó</MenuItem>
              <MenuItem value="AGENDADO">Agendado</MenuItem>
              <MenuItem value="COMPLETADO">Completado</MenuItem>
              <MenuItem value="PAGO_RECHAZADO">Pago rechazado</MenuItem>
              <MenuItem value="OPT_OUT">Opt-out</MenuItem>
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
              <MenuItem value="META_ADS">Meta Ads</MenuItem>
              <MenuItem value="WHATSAPP_INBOUND">WhatsApp Inbound</MenuItem>
              <MenuItem value="APP_USER">App User</MenuItem>
              <MenuItem value="PANEL">Panel</MenuItem>
              <MenuItem value="REFERIDO">Referido</MenuItem>
              <MenuItem value="ORGANICO">Orgánico</MenuItem>
              <MenuItem value="BROADCAST">Broadcast</MenuItem>
            </Select>
          </FormControl>
          <IconButton onClick={() => { fetchLeads(); fetchStats(); }}>
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
                      indeterminate={selectedIds.size > 0 && selectedIds.size < leads.length}
                      checked={leads.length > 0 && selectedIds.size === leads.length}
                      onChange={toggleSelectAll}
                      size="small"
                    />
                  </TableCell>
                  {sortableColumns.slice(0, 1).map((col) => (
                    <TableCell key={col.field}>
                      <TableSortLabel
                        active={sortField === col.field}
                        direction={sortField === col.field ? sortDirection : 'asc'}
                        onClick={() => handleSort(col.field)}
                      >
                        {col.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                  <TableCell>Teléfono</TableCell>
                  {sortableColumns.slice(1, 2).map((col) => (
                    <TableCell key={col.field}>
                      <TableSortLabel
                        active={sortField === col.field}
                        direction={sortField === col.field ? sortDirection : 'asc'}
                        onClick={() => handleSort(col.field)}
                      >
                        {col.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                  {sortableColumns.slice(2, 4).map((col) => (
                    <TableCell key={col.field}>
                      <TableSortLabel
                        active={sortField === col.field}
                        direction={sortField === col.field ? sortDirection : 'asc'}
                        onClick={() => handleSort(col.field)}
                      >
                        {col.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                  <TableCell>Secuencia</TableCell>
                  <TableCell>Canales</TableCell>
                  {sortableColumns.slice(4).map((col) => (
                    <TableCell key={col.field}>
                      <TableSortLabel
                        active={sortField === col.field}
                        direction={sortField === col.field ? sortDirection : 'desc'}
                        onClick={() => handleSort(col.field)}
                      >
                        {col.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {leads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center">
                      <Stack alignItems="center" spacing={1} py={4}>
                        <PeopleIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                        <Typography color="text.secondary">
                          {searchTerm ? 'No se encontraron leads con esa búsqueda' : 'No hay leads registrados'}
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ) : (
                  leads.map((lead) => (
                    <TableRow key={lead.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedIds.has(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                          size="small"
                          disabled={!lead.phone || lead.status === 'OPT_OUT'}
                        />
                      </TableCell>
                      <TableCell>{lead.name || '—'}</TableCell>
                      <TableCell>{lead.phone || '—'}</TableCell>
                      <TableCell>{lead.email || '—'}</TableCell>
                      <TableCell>
                        <Chip
                          label={STATUS_LABELS[lead.status] || lead.status}
                          color={STATUS_COLORS[lead.status]}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip label={SOURCE_LABELS[lead.source] || lead.source} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        {lead.secuencia_activa !== 'NINGUNA' ? (
                          <Chip label={`${lead.secuencia_activa} (${lead.secuencia_paso})`} size="small" color="info" variant="outlined" />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5}>
                          {lead.channels?.map((ch) => (
                            <Chip key={ch} label={ch} size="small" variant="outlined" />
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell>{lead.mensajes_enviados}</TableCell>
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
                {from}–{to} de {totalCount} leads
              </Typography>
            </Stack>
          </Box>
        </Paper>
      )}

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nuevo Lead</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Nombre"
              value={newLead.name}
              onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
              fullWidth
            />
            <TextField
              label="Teléfono"
              value={newLead.phone}
              onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
              fullWidth
              placeholder="+57..."
            />
            <TextField
              label="Email"
              value={newLead.email}
              onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Fuente</InputLabel>
              <Select
                value={newLead.source}
                label="Fuente"
                onChange={(e) => setNewLead({ ...newLead, source: e.target.value as LeadSource })}
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
          <Button variant="contained" onClick={handleCreateLead}>
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
