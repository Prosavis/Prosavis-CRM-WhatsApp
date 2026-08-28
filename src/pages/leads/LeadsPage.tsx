import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PeopleIcon from '@mui/icons-material/People';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import SendIcon from '@mui/icons-material/Send';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';

import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputLabel from '@mui/material/InputLabel';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Pagination from '@mui/material/Pagination';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
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
import { directoryMonitorService } from '@/services/directoryMonitorService';
import DirectoryEntryDrawer from '@/components/directory/DirectoryEntryDrawer';
import DirectoryEditDialog from '@/components/directory/DirectoryEditDialog';
import DirectoryMonitorPanel from '@/components/directory/DirectoryMonitorPanel';
import type { DirectoryEntry, DirectorySource } from '@/types/lead';
import DirectoryClassificationTagPicker from '@/components/directory/DirectoryClassificationTagPicker';
import { ContactAvatar } from '@/components/common/ContactAvatar';
import {
  DIRECTORY_DEFAULT_PAGE_SIZE,
  DIRECTORY_PAGE_SIZE_OPTIONS,
  directoryPagingAfterFilterChange,
} from '@/utils/directoryListPaging';
import { crmToast } from '@/utils/crmToast';

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
  APP_USER: 'App',
  WHATSAPP_INBOUND: 'WhatsApp',
  META_ADS: 'Meta Ads',
  REFERIDO: 'Referido',
  ORGANICO: 'Orgánico',
  BROADCAST: 'Masivo',
  PANEL: 'Panel',
};

const CHANNEL_LABELS: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  IN_APP: 'App',
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
  blacklisted: number;
  byClassification: Record<string, number>;
  bySource: Record<string, number>;
}

type SortField = 'full_name' | 'email' | 'status' | 'source' | 'messages_count' | 'classification';
type SortDirection = 'asc' | 'desc';

const SEARCH_DEBOUNCE_MS = 400;
const fmtCount = (value: number) => value.toLocaleString('es-CO');

const kpiChipSx = (active: boolean) => ({
  appearance: 'none' as const,
  border: '1px solid',
  borderColor: active ? 'transparent' : 'divider',
  bgcolor: active ? 'primary.main' : 'background.paper',
  color: active ? 'primary.contrastText' : 'text.primary',
  borderRadius: 2,
  px: 1.75,
  py: 1,
  minWidth: 92,
  cursor: 'pointer',
  textAlign: 'left' as const,
  transition: 'background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease',
  boxShadow: active ? '0 8px 20px rgba(0, 36, 70, 0.16)' : 'none',
  '&:hover': {
    borderColor: active ? 'transparent' : 'primary.main',
    bgcolor: active ? 'primary.dark' : 'action.hover',
  },
  '&:focus-visible': {
    outline: '2px solid',
    outlineColor: 'secondary.main',
    outlineOffset: 2,
  },
});

export interface LeadsPageProps {
  /** Cuando es true, se omite el título principal (p. ej. dentro de WhatsApp Cloud). */
  embedded?: boolean;
  onOpenInInbox?: (phone: string, name?: string) => void;
  onOpenBulk?: () => void;
}

const LeadsPage: React.FC<LeadsPageProps> = ({ embedded = false, onOpenInInbox, onOpenBulk }) => {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setSnackbar = ({
    message,
    severity,
  }: {
    open?: boolean;
    message: string;
    severity: 'success' | 'error';
  }) => {
    crmToast.show(severity, message);
  };

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [classificationFilter, setClassificationFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [blacklistedFilter, setBlacklistedFilter] = useState(false);
  const [phoneNull, setPhoneNull] = useState<boolean>(false);
  const [emailNull, setEmailNull] = useState<boolean>(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);
  const [selectedEntry, setSelectedEntry] = useState<DirectoryEntry | null>(null);
  const [editEntry, setEditEntry] = useState<DirectoryEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(DIRECTORY_DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<DirectoryStats>({
    total: 0,
    active: 0,
    inactive: 0,
    optOut: 0,
    blacklisted: 0,
    byClassification: {},
    bySource: {},
  });

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const [showMonitor, setShowMonitor] = useState(false);
  const [issueOpenTotal, setIssueOpenTotal] = useState(0);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [newEntry, setNewEntry] = useState({
    phone: '',
    fullName: '',
    email: '',
    source: 'PANEL' as string,
  });

  const resetListPaging = useCallback(() => {
    const next = directoryPagingAfterFilterChange();
    setPage(next.page);
    setRowsPerPage(next.rowsPerPage);
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const result = await directoryService.getStats();
      setStats(result);
    } catch {
      // Stats fallback silencioso
    }
    try {
      const issueStats = await directoryMonitorService.getIssueStats();
      setIssueOpenTotal(issueStats.openTotal);
    } catch {
      // Issue stats fallback silencioso
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
      if (blacklistedFilter) filters.blacklisted = true;
      if (phoneNull) filters.phoneNull = true;
      if (emailNull) filters.emailNull = true;
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
  }, [statusFilter, classificationFilter, sourceFilter, blacklistedFilter, phoneNull, emailNull, page, rowsPerPage, searchTerm, sortField, sortDirection]);

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
      setSnackbar({ open: true, message: 'Cliente agregado al directorio', severity: 'success' });
      setCreateDialogOpen(false);
      setNewEntry({ phone: '', fullName: '', email: '', source: 'PANEL' });
      fetchEntries();
      fetchStats();
    } catch {
      setSnackbar({ open: true, message: 'No se pudo agregar el cliente', severity: 'error' });
    }
  };

  const handleSeedAllUsers = async () => {
    setSeedLoading(true);
    try {
      const result = await directoryService.seedAllUsersAsEntries();
      setSnackbar({
        open: true,
        message: `Importación lista: ${result.created} creados, ${result.skipped} ya estaban, ${result.errors} errores`,
        severity: result.errors > 0 ? 'error' : 'success',
      });
      setSeedDialogOpen(false);
      fetchEntries();
      fetchStats();
    } catch {
      setSnackbar({ open: true, message: 'No se pudieron importar los usuarios de la app', severity: 'error' });
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
      resetListPaging();
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
  const selectedInboxCount = selectedEntries.filter((e) => e.phone && e.status !== 'opt_out').length;
  const totalPages = Math.max(1, Math.ceil(totalCount / rowsPerPage));
  const columnCount = onOpenInInbox ? 12 : 11;

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value - 1);
  };

  const kpis: Array<{
    label: string;
    value: number;
    active?: boolean;
    onClick?: () => void;
  }> = [
    {
      label: 'Total',
      value: stats.total,
      active: !blacklistedFilter && !statusFilter,
      onClick: () => {
        setBlacklistedFilter(false);
        setStatusFilter('');
        setClassificationFilter('');
        resetListPaging();
        setShowMonitor(false);
      },
    },
    {
      label: 'Activos',
      value: stats.active,
      active: statusFilter === 'active' && !blacklistedFilter,
      onClick: () => {
        setBlacklistedFilter(false);
        setStatusFilter('active');
        resetListPaging();
        setShowMonitor(false);
      },
    },
    {
      label: 'Inactivos',
      value: stats.inactive,
      active: statusFilter === 'inactive' && !blacklistedFilter,
      onClick: () => {
        setBlacklistedFilter(false);
        setStatusFilter('inactive');
        resetListPaging();
        setShowMonitor(false);
      },
    },
    {
      label: 'Opt-out',
      value: stats.optOut,
      active: statusFilter === 'opt_out' && !blacklistedFilter,
      onClick: () => {
        setBlacklistedFilter(false);
        setStatusFilter('opt_out');
        resetListPaging();
        setShowMonitor(false);
      },
    },
    {
      label: 'Bloqueados',
      value: stats.blacklisted,
      active: blacklistedFilter,
      onClick: () => {
        const next = !blacklistedFilter;
        setBlacklistedFilter(next);
        if (next) {
          setStatusFilter('');
          setClassificationFilter('');
        }
        resetListPaging();
        setShowMonitor(false);
      },
    },
  ];

  const from = totalCount === 0 ? 0 : page * rowsPerPage + 1;
  const to = Math.min((page + 1) * rowsPerPage, totalCount);

  return (
    <Box sx={{ p: embedded ? { xs: 1.5, sm: 2 } : { xs: 1, sm: 2, md: 3 } }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'flex-start' }}
        spacing={2}
        mb={2.5}
      >
        <Box>
          <Typography variant={embedded ? 'h5' : 'h4'} fontWeight={700} letterSpacing="-0.02em">
            Directorio
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 520 }}>
            Clientes y leads para crecer. Empieza en {DIRECTORY_DEFAULT_PAGE_SIZE} por página;
            puedes subir a 25, 50 o 100 si lo necesitas.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent={{ xs: 'flex-start', md: 'flex-end' }}>
          {onOpenInInbox && selectedInboxCount > 0 && (
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
              Abrir en inbox ({selectedInboxCount})
            </Button>
          )}
          {onOpenBulk && (
            <Tooltip title="Envía un WhatsApp a varios clientes por la línea de citas (312).">
              <Button
                variant="outlined"
                startIcon={<SendIcon />}
                onClick={onOpenBulk}
                size="small"
              >
                Enviar WhatsApp masivo
              </Button>
            </Tooltip>
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            size="small"
          >
            Nuevo cliente
          </Button>
          <Tooltip title="Más acciones">
            <IconButton
              size="small"
              aria-label="Más acciones del directorio"
              aria-haspopup="true"
              onClick={(event) => setMoreAnchor(event.currentTarget)}
            >
              <MoreVertIcon />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={moreAnchor}
            open={Boolean(moreAnchor)}
            onClose={() => setMoreAnchor(null)}
          >
            <MenuItem
              disabled={seedLoading}
              onClick={() => {
                setMoreAnchor(null);
                setSeedDialogOpen(true);
              }}
            >
              Importar usuarios de la app
            </MenuItem>
          </Menu>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={2} role="tablist" aria-label="Filtros del directorio">
        {kpis.map((kpi) => (
          <Box
            key={kpi.label}
            component="button"
            type="button"
            role="tab"
            aria-selected={Boolean(kpi.active)}
            onClick={kpi.onClick}
            sx={kpiChipSx(Boolean(kpi.active))}
          >
            <Typography
              variant="h6"
              fontWeight={700}
              lineHeight={1.15}
              color="inherit"
            >
              {fmtCount(kpi.value)}
            </Typography>
            <Typography variant="caption" color="inherit" sx={{ opacity: 0.78 }}>
              {kpi.label}
            </Typography>
          </Box>
        ))}
        <Box
          component="button"
          type="button"
          role="tab"
          aria-selected={showMonitor}
          onClick={() => setShowMonitor((prev) => !prev)}
          sx={{
            ...kpiChipSx(showMonitor),
            minWidth: 120,
            bgcolor: showMonitor ? 'warning.main' : 'background.paper',
            color: showMonitor ? 'warning.contrastText' : 'text.primary',
            '&:hover': {
              borderColor: showMonitor ? 'transparent' : 'warning.main',
              bgcolor: showMonitor ? 'warning.dark' : 'action.hover',
            },
          }}
        >
          <Badge badgeContent={issueOpenTotal} color="error" max={999}>
            <TroubleshootIcon fontSize="small" color={showMonitor ? 'inherit' : 'action'} />
          </Badge>
          <Typography variant="caption" color="inherit" sx={{ display: 'block', mt: 0.5, opacity: 0.78 }}>
            Monitoreo
          </Typography>
        </Box>
      </Stack>

      {showMonitor && (
        <DirectoryMonitorPanel
          onDirectoryChanged={() => {
            fetchEntries();
            fetchStats();
          }}
        />
      )}

      {!showMonitor && (
      <>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          alignItems: 'center',
          mb: 2,
          px: 2,
          py: 1.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: (theme) =>
            theme.palette.mode === 'light' ? 'rgba(0, 36, 70, 0.03)' : 'rgba(255, 255, 255, 0.03)',
        }}
      >
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
          sx={{ minWidth: 260, flex: { xs: '1 1 100%', md: '1 1 280px' }, maxWidth: 420 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Estado</InputLabel>
          <Select
            value={statusFilter}
            label="Estado"
            onChange={(e) => {
              setStatusFilter(e.target.value);
              resetListPaging();
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
            value={blacklistedFilter ? 'Bloqueado' : classificationFilter}
            label="Clasificación"
            onChange={(e) => {
              const value = e.target.value;
              setClassificationFilter(value === 'Bloqueado' ? '' : value);
              setBlacklistedFilter(value === 'Bloqueado');
              resetListPaging();
            }}
          >
            <MenuItem value="">Todas</MenuItem>
            <MenuItem value="user">Usuario</MenuItem>
            <MenuItem value="Empresas">Empresas</MenuItem>
            <MenuItem value="lead">Lead</MenuItem>
            <MenuItem value="Bloqueado">Bloqueado</MenuItem>
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
              resetListPaging();
            }}
          >
            <MenuItem value="">Todas</MenuItem>
            <MenuItem value="APP_USER">App</MenuItem>
            <MenuItem value="WHATSAPP_INBOUND">WhatsApp</MenuItem>
            <MenuItem value="META_ADS">Meta Ads</MenuItem>
            <MenuItem value="PANEL">Panel</MenuItem>
            <MenuItem value="REFERIDO">Referido</MenuItem>
            <MenuItem value="ORGANICO">Orgánico</MenuItem>
            <MenuItem value="BROADCAST">Masivo</MenuItem>
          </Select>
        </FormControl>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={phoneNull}
              onChange={(e) => { setPhoneNull(e.target.checked); resetListPaging(); }}
            />
          }
          label="Sin teléfono"
        />
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={emailNull}
              onChange={(e) => { setEmailNull(e.target.checked); resetListPaging(); }}
            />
          }
          label="Sin email"
        />
        <Tooltip title="Actualizar lista">
          <IconButton onClick={() => { fetchEntries(); fetchStats(); }} aria-label="Actualizar directorio">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Paper
        elevation={0}
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
        }}
      >
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
                <TableCell>
                  <TableSortLabel
                    active={sortField === 'email'}
                    direction={sortField === 'email' ? sortDirection : 'asc'}
                    onClick={() => handleSort('email')}
                  >
                    Email
                  </TableSortLabel>
                </TableCell>
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
                <TableCell>Tags</TableCell>
                <TableCell>Último contacto</TableCell>
                {onOpenInInbox && (
                  <TableCell align="center" sx={{ minWidth: 64 }}>
                    Acciones
                  </TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                Array.from({ length: DIRECTORY_DEFAULT_PAGE_SIZE }, (_, index) => (
                  <TableRow key={`skeleton-${index}`}>
                    <TableCell padding="checkbox"><Skeleton variant="rounded" width={18} height={18} /></TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Skeleton variant="circular" width={40} height={40} />
                        <Box sx={{ flex: 1 }}>
                          <Skeleton width="58%" />
                          <Skeleton width="40%" />
                        </Box>
                      </Stack>
                    </TableCell>
                    {Array.from({ length: columnCount - 2 }, (__, cell) => (
                      <TableCell key={cell}><Skeleton width="70%" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columnCount} align="center">
                    <Stack alignItems="center" spacing={1.25} py={6}>
                      <PeopleIcon sx={{ fontSize: 44, color: 'text.disabled' }} />
                      <Typography fontWeight={600}>
                        {searchTerm ? 'Nadie coincide con esa búsqueda' : 'Todavía no hay clientes aquí'}
                      </Typography>
                      <Typography color="text.secondary" variant="body2" sx={{ maxWidth: 360 }}>
                        {searchTerm
                          ? 'Prueba otro nombre, teléfono o email, o limpia los filtros.'
                          : 'Agrega un cliente para tenerlo a mano cuando entre por WhatsApp.'}
                      </Typography>
                      {!searchTerm && (
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => setCreateDialogOpen(true)}
                        >
                          Nuevo cliente
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow
                    key={entry.id}
                    hover
                    sx={{
                      cursor: 'pointer',
                      '& td': { py: 1.25 },
                    }}
                    onDoubleClick={() => {
                      setSelectedEntry(entry);
                      setDrawerOpen(true);
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedIds.has(entry.id)}
                        onChange={() => toggleSelect(entry.id)}
                        size="small"
                        disabled={!entry.phone || entry.status === 'opt_out'}
                      />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <ContactAvatar
                          displayName={entry.fullName}
                          phone={entry.phone}
                          photoUrl={entry.photoUrl}
                          size={40}
                        />
                        <Box minWidth={0}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {entry.fullName || 'Sin nombre'}
                          </Typography>
                          <Typography
                            variant="caption"
                            color={entry.phone ? 'text.secondary' : 'text.disabled'}
                            sx={{ fontFamily: entry.phone ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit' }}
                            noWrap
                          >
                            {entry.phone || 'Sin teléfono'}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color={entry.email ? 'text.primary' : 'text.disabled'} noWrap>
                        {entry.email || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DirectoryClassificationTagPicker
                        entry={entry}
                        compact
                        autoSave
                        onSaved={(updated) => {
                          setEntries((prev) =>
                            prev.map((row) => (row.id === updated.id ? updated : row))
                          );
                        }}
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
                            label={CHANNEL_LABELS[ch] || ch}
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
                      {entry.tags && entry.tags.length > 0 ? (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                          {entry.tags.slice(0, 3).map((tag) => (
                            <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ height: 22 }} />
                          ))}
                          {entry.tags.length > 3 && (
                            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: '22px' }}>
                              +{entry.tags.length - 3}
                            </Typography>
                          )}
                        </Stack>
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          —
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {entry.lastContactAt
                        ? new Date(entry.lastContactAt).toLocaleDateString('es-CO', {
                            day: '2-digit',
                            month: 'short',
                          })
                        : '—'}
                    </TableCell>
                    {onOpenInInbox && (
                      <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                        <Tooltip
                          title={
                            !entry.phone
                              ? 'Sin teléfono'
                              : entry.status === 'opt_out'
                                ? 'Contacto con opt-out'
                                : 'Abrir en Inbox'
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              color="success"
                              disabled={!entry.phone || entry.status === 'opt_out'}
                              aria-label={`Abrir en inbox: ${entry.fullName || entry.phone || 'contacto'}`}
                              onClick={() => {
                                if (!entry.phone || entry.status === 'opt_out') return;
                                onOpenInInbox(
                                  entry.phone,
                                  entry.fullName || entry.displayName || undefined,
                                );
                              }}
                            >
                              <WhatsAppIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    )}
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
            justifyContent: 'space-between',
            gap: 2,
            py: 1.75,
            px: 2,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: (theme) =>
              theme.palette.mode === 'light' ? 'rgba(0, 36, 70, 0.02)' : 'rgba(255, 255, 255, 0.02)',
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
              {DIRECTORY_PAGE_SIZE_OPTIONS.map((size) => (
                <MenuItem key={size} value={size}>
                  {size}
                </MenuItem>
              ))}
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
              siblingCount={1}
              boundaryCount={1}
            />
            <Typography variant="caption" color="text.secondary">
              {from}–{to} de {fmtCount(totalCount)} clientes
            </Typography>
          </Stack>
        </Box>
      </Paper>
      </>
      )}

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nuevo cliente</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Lo agregas al directorio para poder escribirle o incluirlo en un envío masivo.
          </DialogContentText>
          <Stack spacing={2}>
            <TextField
              label="Nombre completo"
              value={newEntry.fullName}
              onChange={(e) => setNewEntry({ ...newEntry, fullName: e.target.value })}
              fullWidth
              autoFocus
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
            Guardar cliente
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={seedDialogOpen}
        onClose={() => !seedLoading && setSeedDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Importar usuarios de la app</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Copia al directorio a todas las personas que ya tienen cuenta en la app Prosavis.
            No borra contactos existentes: si ya están, los omite. Puede tardar unos segundos.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSeedDialogOpen(false)} disabled={seedLoading}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSeedAllUsers}
            disabled={seedLoading}
            startIcon={seedLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {seedLoading ? 'Importando…' : 'Importar'}
          </Button>
        </DialogActions>
      </Dialog>

      {selectedEntry && (
        <DirectoryEntryDrawer
          open={drawerOpen}
          entry={selectedEntry}
          onClose={() => setDrawerOpen(false)}
          onEdit={(entry: DirectoryEntry) => {
            setDrawerOpen(false);
            setEditEntry(entry);
            setTimeout(() => setEditDialogOpen(true), 300);
          }}
        />
      )}

      {editEntry && (
        <DirectoryEditDialog
          open={editDialogOpen}
          entry={editEntry}
          onClose={() => {
            setEditDialogOpen(false);
            setEditEntry(null);
          }}
          onSaved={() => {
            setEditDialogOpen(false);
            setEditEntry(null);
            fetchEntries();
            fetchStats();
          }}
        />
      )}
    </Box>
  );
};

export default LeadsPage;
