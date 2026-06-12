import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  Pagination,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FilterListIcon from '@mui/icons-material/FilterList';
import PeopleIcon from '@mui/icons-material/People';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import TroubleshootIcon from '@mui/icons-material/Troubleshoot';
import { directoryService } from '@/services/directoryService';
import { directoryMonitorService } from '@/services/directoryMonitorService';
import { ContactAvatar } from '@/components/common/ContactAvatar';
import DirectoryEntryDrawer from '@/components/directory/DirectoryEntryDrawer';
import DirectoryEditDialog from '@/components/directory/DirectoryEditDialog';
import DirectoryMonitorPanel from '@/components/directory/DirectoryMonitorPanel';
import type { DirectoryEntry } from '@/types/lead';
import {
  DIRECTORY_STATUS_LABELS,
  DIRECTORY_STATUS_SUMMARY,
  getDirectoryEffectiveStatus,
  getDirectoryStatusTooltip,
} from '@/utils/directoryContactStatus';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const CLASSIFICATION_CHIP_COLORS: Record<string, 'default' | 'primary' | 'info' | 'warning' | 'success'> = {
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

const SOURCE_LABELS: Record<string, string> = {
  APP_USER: 'App',
  WHATSAPP_INBOUND: 'WhatsApp',
  META_ADS: 'Meta Ads',
  REFERIDO: 'Referido',
  ORGANICO: 'Orgánico',
  BROADCAST: 'Broadcast',
  PANEL: 'Panel',
};

const SEARCH_DEBOUNCE_MS = 350;
const ROWS_PER_PAGE = 50;

type SortField = 'full_name' | 'email' | 'status' | 'classification' | 'source' | 'messages_count';
type SortDirection = 'asc' | 'desc';

interface DirectoryStats {
  total: number;
  active: number;
  inactive: number;
  optOut: number;
  byClassification: Record<string, number>;
  bySource: Record<string, number>;
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

interface WhatsAppDirectoryContactsDialogProps {
  open: boolean;
  onClose: () => void;
}

const WhatsAppDirectoryContactsDialog: React.FC<WhatsAppDirectoryContactsDialogProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('md'));

  // Data
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DirectoryStats>({
    total: 0,
    active: 0,
    inactive: 0,
    optOut: 0,
    byClassification: {},
    bySource: {},
  });

  // Search & filters
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [classificationFilter, setClassificationFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [phoneNull, setPhoneNull] = useState(false);
  const [emailNull, setEmailNull] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Drawer & edit dialog
  const [selectedEntry, setSelectedEntry] = useState<DirectoryEntry | null>(null);
  const [editEntry, setEditEntry] = useState<DirectoryEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Pagination
  const [page, setPage] = useState(0);

  // Sort
  const [sortField, setSortField] = useState<SortField>('full_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Monitoreo (orquestador de calidad del directorio)
  const [showMonitor, setShowMonitor] = useState(false);
  const [issueOpenTotal, setIssueOpenTotal] = useState(0);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch stats ──────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const result = await directoryService.getStats();
      setStats(result);
    } catch {
      // Silencio
    }
  }, []);

  const fetchIssueCount = useCallback(async () => {
    try {
      const result = await directoryMonitorService.getIssueStats();
      setIssueOpenTotal(result.openTotal);
    } catch {
      // Silencio
    }
  }, []);

  // ── Fetch entries ────────────────────────

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await directoryService.getEntries({
        limit: ROWS_PER_PAGE,
        page,
        searchTerm: searchTerm || undefined,
        classification: classificationFilter || undefined,
        status: statusFilter || undefined,
        source: sourceFilter || undefined,
        phoneNull: phoneNull || undefined,
        emailNull: emailNull || undefined,
        sortField: sortField || undefined,
        sortDirection,
      });
      setEntries(result.entries);
      setTotalCount(result.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar contactos');
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, classificationFilter, statusFilter, sourceFilter, phoneNull, emailNull, sortField, sortDirection]);

  // ── Effects ──────────────────────────────

  useEffect(() => {
    if (open) {
      fetchStats();
      fetchIssueCount();
    }
  }, [open, fetchStats, fetchIssueCount]);

  useEffect(() => {
    if (open) {
      fetchEntries();
    }
  }, [open, fetchEntries]);

  // ── Handlers ─────────────────────────────

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchTerm(value.trim());
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleSort = (field: SortField) => {
    setPage(0);
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'messages_count' ? 'desc' : 'asc');
    }
  };

  const handleClearFilters = () => {
    setSearchInput('');
    setSearchTerm('');
    setClassificationFilter('');
    setStatusFilter('');
    setSourceFilter('');
    setPhoneNull(false);
    setEmailNull(false);
    setPage(0);
  };

  // ── Derived ──────────────────────────────

  const totalPages = Math.ceil(totalCount / ROWS_PER_PAGE);
  const hasFilters = Boolean(searchTerm || classificationFilter || statusFilter || sourceFilter);
  const from = totalCount === 0 ? 0 : page * ROWS_PER_PAGE + 1;
  const to = Math.min((page + 1) * ROWS_PER_PAGE, totalCount);

  // ── Render ───────────────────────────────

  const filterChip = (label: string, _value: string | undefined, active: boolean, onClick: () => void, color: string) => (
    <Chip
      label={label}
      size="small"
      variant={active ? 'filled' : 'outlined'}
      color={active ? (color as 'primary' | 'info' | 'warning' | 'success' | 'error') : undefined}
      onClick={onClick}
      sx={{ cursor: 'pointer', fontWeight: active ? 600 : 400 }}
    />
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="xl"
      fullWidth
      scroll="paper"
      sx={{ '& .MuiDialog-paper': { height: fullScreen ? '100%' : '90vh' } }}
    >
      {/* ── Header ─────────────────────────── */}
      <DialogTitle sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <PeopleIcon color="primary" />
        <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
          Directorio de Contactos
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="Cerrar directorio">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Divider />

      {/* ── Stats bar ──────────────────────── */}
      <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover' }}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
          <Chip icon={<PeopleIcon />} label={`${stats.total.toLocaleString('es-CO')} total`} size="small" color="primary" variant="outlined" />
          <Tooltip title={DIRECTORY_STATUS_SUMMARY.active} arrow>
            <Chip label={`${stats.active.toLocaleString('es-CO')} activos`} size="small" color="success" variant="outlined" />
          </Tooltip>
          <Tooltip title={DIRECTORY_STATUS_SUMMARY.inactive} arrow>
            <Chip label={`${stats.inactive.toLocaleString('es-CO')} inactivos`} size="small" variant="outlined" />
          </Tooltip>
          {stats.optOut > 0 && (
            <Tooltip title={DIRECTORY_STATUS_SUMMARY.opt_out} arrow>
              <Chip label={`${stats.optOut} opt-out`} size="small" color="error" variant="outlined" />
            </Tooltip>
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Revisa inconsistencias del directorio (sin nombre, duplicados, teléfonos inválidos) y sugerencias de IA. Solo disponible en este CRM.">
            <Badge badgeContent={issueOpenTotal} color="error" max={999}>
              <Button
                size="small"
                variant={showMonitor ? 'contained' : 'outlined'}
                color="warning"
                startIcon={<TroubleshootIcon fontSize="small" />}
                onClick={() => setShowMonitor((prev) => !prev)}
              >
                {showMonitor ? 'Ver contactos' : 'Monitoreo del contacto'}
              </Button>
            </Badge>
          </Tooltip>
          <Tooltip title="Actualizar">
            <IconButton size="small" onClick={() => { fetchStats(); fetchEntries(); fetchIssueCount(); }}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* ── Monitoreo del directorio (orquestador de calidad) ── */}
      {showMonitor && (
        <DialogContent sx={{ p: 2, overflow: 'auto' }}>
          <DirectoryMonitorPanel
            onDirectoryChanged={() => {
              fetchStats();
              fetchEntries();
              fetchIssueCount();
            }}
          />
        </DialogContent>
      )}

      {!showMonitor && (
      <>
      {/* ── Search bar ─────────────────────── */}
      <Box sx={{ px: 2, py: 1.5 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <TextField
            size="small"
            placeholder="Buscar por nombre, teléfono o email..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            }}
            sx={{ flex: '1 1 280px', minWidth: 200 }}
          />

          <Tooltip title="Filtros">
            <IconButton size="small" onClick={() => setShowFilters(!showFilters)} color={hasFilters ? 'primary' : 'default'}>
              <FilterListIcon />
            </IconButton>
          </Tooltip>

          {hasFilters && (
            <Chip label="Limpiar filtros" size="small" onDelete={handleClearFilters} color="warning" />
          )}
        </Stack>

        {/* ── Filter chips ─────────────────── */}
        {showFilters && (
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
            {/* Clasificación */}
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Tipo:</Typography>
              {['', ...Object.keys(CLASSIFICATION_LABELS)].map((key) => {
                const label = key ? CLASSIFICATION_LABELS[key] : 'Todas';
                const color = key ? (CLASSIFICATION_CHIP_COLORS[key] ?? 'default') : 'default';
                return filterChip(label, key, classificationFilter === key, () => {
                  setClassificationFilter(key);
                  setPage(0);
                }, color);
              })}
            </Stack>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

            {/* Estado */}
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Estado:</Typography>
              {(['', 'active', 'inactive', 'opt_out'] as const).map((key) => {
                const label = key ? DIRECTORY_STATUS_LABELS[key] : 'Todos';
                const color = key ? (STATUS_CHIP_COLORS[key] ?? 'default') : 'default';
                const chip = filterChip(label, key, statusFilter === key, () => {
                  setStatusFilter(key);
                  setPage(0);
                }, color as string);
                if (!key) return chip;
                return (
                  <Tooltip key={key} title={DIRECTORY_STATUS_SUMMARY[key]} arrow>
                    <span>{chip}</span>
                  </Tooltip>
                );
              })}
            </Stack>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

            {/* Fuente */}
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Origen:</Typography>
              {['', 'APP_USER', 'WHATSAPP_INBOUND', 'META_ADS', 'REFERIDO', 'ORGANICO', 'PANEL'].map((key) => {
                const label = key ? (SOURCE_LABELS[key] ?? key) : 'Todos';
                return filterChip(label, key, sourceFilter === key, () => {
                  setSourceFilter(key);
                  setPage(0);
                }, 'default');
              })}
            </Stack>

            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={phoneNull}
                  onChange={(e) => { setPhoneNull(e.target.checked); setPage(0); }}
                />
              }
              label={<Typography variant="caption">Sin teléfono</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={emailNull}
                  onChange={(e) => { setEmailNull(e.target.checked); setPage(0); }}
                />
              }
              label={<Typography variant="caption">Sin email</Typography>}
            />
          </Stack>
        )}
      </Box>

      {loading && <LinearProgress />}

      {/* ── Error ──────────────────────────── */}
      {error && (
        <Box sx={{ px: 2, py: 1 }}>
          <Typography color="error" variant="body2">{error}</Typography>
        </Box>
      )}

      {/* ── Table ──────────────────────────── */}
      <DialogContent sx={{ p: 0, overflow: 'auto' }}>
        <TableContainer>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, minWidth: 220 }}>
                  <TableSortLabel
                    active={sortField === 'full_name'}
                    direction={sortField === 'full_name' ? sortDirection : 'asc'}
                    onClick={() => handleSort('full_name')}
                  >
                    Nombre
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, minWidth: 180 }}>Teléfono</TableCell>
                <TableCell sx={{ fontWeight: 700, minWidth: 200 }}>
                  <TableSortLabel
                    active={sortField === 'email'}
                    direction={sortField === 'email' ? sortDirection : 'asc'}
                    onClick={() => handleSort('email')}
                  >
                    Email
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, minWidth: 100 }}>
                  <TableSortLabel
                    active={sortField === 'classification'}
                    direction={sortField === 'classification' ? sortDirection : 'asc'}
                    onClick={() => handleSort('classification')}
                  >
                    Tipo
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, minWidth: 90 }}>Origen</TableCell>
                <TableCell sx={{ fontWeight: 700, minWidth: 90 }}>
                  <TableSortLabel
                    active={sortField === 'status'}
                    direction={sortField === 'status' ? sortDirection : 'asc'}
                    onClick={() => handleSort('status')}
                  >
                    Estado
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={{ fontWeight: 700, minWidth: 120 }}>Tags</TableCell>
                <TableCell sx={{ fontWeight: 700, minWidth: 100 }} align="right">
                  <TableSortLabel
                    active={sortField === 'messages_count'}
                    direction={sortField === 'messages_count' ? sortDirection : 'asc'}
                    onClick={() => handleSort('messages_count')}
                  >
                    Mensajes
                  </TableSortLabel>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <Typography color="text.secondary">
                      {hasFilters ? 'No se encontraron contactos con los filtros actuales.' : 'No hay contactos en el directorio.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {entries.map((entry) => {
                const effectiveStatus = getDirectoryEffectiveStatus(entry);

                return (
                <TableRow
                  key={entry.id}
                  hover
                  sx={{ '&:last-child td': { borderBottom: 0 }, cursor: 'pointer' }}
                  onDoubleClick={() => {
                    setSelectedEntry(entry);
                    setDrawerOpen(true);
                  }}
                >
                  {/* Nombre */}
                  <TableCell>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <ContactAvatar
                        displayName={entry.fullName}
                        phone={entry.phone}
                        photoUrl={entry.photoUrl}
                        size={36}
                      />
                      <Box>
                        <Typography variant="body2" fontWeight={600}>
                          {entry.fullName}
                        </Typography>
                        {entry.displayName && entry.displayName !== entry.fullName && (
                          <Typography variant="caption" color="text.secondary">
                            {entry.displayName}
                          </Typography>
                        )}
                      </Box>
                    </Stack>
                  </TableCell>

                  {/* Teléfono */}
                  <TableCell>
                    {entry.phone ? (
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {entry.phone}
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
                  </TableCell>

                  {/* Email */}
                  <TableCell>
                    {entry.email ? (
                      <Typography variant="body2">{entry.email}</Typography>
                    ) : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
                  </TableCell>

                  {/* Clasificación */}
                  <TableCell>
                    <Chip
                      label={CLASSIFICATION_LABELS[entry.classification] ?? entry.classification}
                      size="small"
                      color={CLASSIFICATION_CHIP_COLORS[entry.classification] as 'primary' | 'info' | 'warning' | 'default' | undefined}
                      variant="outlined"
                    />
                  </TableCell>

                  {/* Origen */}
                  <TableCell>
                    {entry.source ? (
                      <Chip
                        label={SOURCE_LABELS[entry.source] ?? entry.source}
                        size="small"
                        variant="outlined"
                      />
                    ) : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
                  </TableCell>

                  {/* Estado */}
                  <TableCell>
                    <Tooltip title={getDirectoryStatusTooltip(entry)} arrow>
                      <Chip
                        label={DIRECTORY_STATUS_LABELS[effectiveStatus]}
                        size="small"
                        color={STATUS_CHIP_COLORS[effectiveStatus] as 'success' | 'default' | 'error' | undefined}
                        variant={effectiveStatus === 'active' ? 'filled' : 'outlined'}
                      />
                    </Tooltip>
                  </TableCell>

                  {/* Tags */}
                  <TableCell>
                    {entry.tags && entry.tags.length > 0 ? (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap">
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
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
                  </TableCell>

                  {/* Mensajes */}
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={entry.messagesCount > 0 ? 600 : 400}>
                      {entry.messagesCount}
                    </Typography>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </DialogContent>

      {/* ── Pagination ─────────────────────── */}
      {totalCount > 0 && (
        <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" spacing={1}>
            <Typography variant="body2" color="text.secondary">
              {from}–{to} de {totalCount.toLocaleString('es-CO')} contactos
            </Typography>
            <Pagination
              count={totalPages}
              page={page + 1}
              onChange={(_, value) => setPage(value - 1)}
              size="small"
              color="primary"
              showFirstButton
              showLastButton
            />
          </Stack>
        </Box>
      )}
      </>
      )}

      {/* ── Drawer & Edit Dialog ───────────── */}
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
    </Dialog>
  );
};

export default WhatsAppDirectoryContactsDialog;
