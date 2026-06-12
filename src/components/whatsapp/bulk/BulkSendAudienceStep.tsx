import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FilterListIcon from '@mui/icons-material/FilterList';
import PeopleIcon from '@mui/icons-material/People';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { ContactAvatar } from '@/components/common/ContactAvatar';
import { directoryService, type DirectoryBulkFilters } from '@/services/directoryService';
import type { DirectoryEntry } from '@/types/lead';
import { downloadDirectoryCsv } from '@/utils/exportDirectoryCsv';
import {
  DIRECTORY_STATUS_LABELS,
  DIRECTORY_STATUS_SUMMARY,
  getDirectoryEffectiveStatus,
} from '@/utils/directoryContactStatus';
import { BULK_SEND_MAX_RECIPIENTS } from './bulkSendTypes';

const CLASSIFICATION_LABELS: Record<string, string> = {
  user: 'Usuario',
  company: 'Empresa',
  lead: 'Lead',
  unknown: 'Desconocido',
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

const STATUS_CHIP_COLORS: Record<string, 'default' | 'success' | 'error' | 'warning'> = {
  active: 'success',
  inactive: 'default',
  opt_out: 'error',
};

const SEARCH_DEBOUNCE_MS = 350;
const ROWS_PER_PAGE = 50;

export interface BulkSendAudienceStepProps {
  selectedIds: Set<string>;
  selectedEntries: DirectoryEntry[];
  manualPhonesRaw: string;
  recipientCount: number;
  onSelectedIdsChange: (ids: Set<string>, entries: DirectoryEntry[]) => void;
  onManualPhonesRawChange: (value: string) => void;
}

const BulkSendAudienceStep: React.FC<BulkSendAudienceStepProps> = ({
  selectedIds,
  selectedEntries,
  manualPhonesRaw,
  recipientCount,
  onSelectedIdsChange,
  onManualPhonesRawChange,
}) => {
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectAllLoading, setSelectAllLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [classificationFilter, setClassificationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [includeOptOut, setIncludeOptOut] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [manualExpanded, setManualExpanded] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bulkFilters = useMemo<DirectoryBulkFilters>(
    () => ({
      searchTerm: searchTerm || undefined,
      classification: classificationFilter || undefined,
      status: statusFilter || undefined,
      source: sourceFilter || undefined,
      includeOptOut,
      limit: ROWS_PER_PAGE,
      page,
      sortField: 'full_name',
      sortDirection: 'asc',
    }),
    [searchTerm, classificationFilter, statusFilter, sourceFilter, includeOptOut, page],
  );

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await directoryService.getEntriesForBulk(bulkFilters);
      setEntries(result.entries);
      setTotalCount(result.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar contactos');
    } finally {
      setLoading(false);
    }
  }, [bulkFilters]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchTerm(value.trim());
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
  };

  const toggleEntry = (entry: DirectoryEntry, checked: boolean) => {
    const nextIds = new Set(selectedIds);
    const nextEntries = [...selectedEntries];
    if (checked) {
      nextIds.add(entry.id);
      if (!nextEntries.some((e) => e.id === entry.id)) nextEntries.push(entry);
    } else {
      nextIds.delete(entry.id);
      const idx = nextEntries.findIndex((e) => e.id === entry.id);
      if (idx >= 0) nextEntries.splice(idx, 1);
    }
    onSelectedIdsChange(nextIds, nextEntries);
  };

  const pageAllSelected =
    entries.length > 0 && entries.every((e) => selectedIds.has(e.id));
  const pageSomeSelected = entries.some((e) => selectedIds.has(e.id)) && !pageAllSelected;

  const togglePage = () => {
    const nextIds = new Set(selectedIds);
    const nextEntries = [...selectedEntries];
    if (pageAllSelected) {
      for (const entry of entries) {
        nextIds.delete(entry.id);
        const idx = nextEntries.findIndex((e) => e.id === entry.id);
        if (idx >= 0) nextEntries.splice(idx, 1);
      }
    } else {
      for (const entry of entries) {
        nextIds.add(entry.id);
        if (!nextEntries.some((e) => e.id === entry.id)) nextEntries.push(entry);
      }
    }
    onSelectedIdsChange(nextIds, nextEntries);
  };

  const handleSelectAllFiltered = async () => {
    setSelectAllLoading(true);
    setError(null);
    try {
      const all = await directoryService.fetchAllEntriesForBulk({
        searchTerm: searchTerm || undefined,
        classification: classificationFilter || undefined,
        status: statusFilter || undefined,
        source: sourceFilter || undefined,
        includeOptOut,
      });
      const nextIds = new Set(selectedIds);
      const nextEntriesMap = new Map(selectedEntries.map((e) => [e.id, e]));
      for (const entry of all) {
        nextIds.add(entry.id);
        nextEntriesMap.set(entry.id, entry);
      }
      onSelectedIdsChange(nextIds, [...nextEntriesMap.values()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron seleccionar todos los filtrados');
    } finally {
      setSelectAllLoading(false);
    }
  };

  const handleDownloadCsv = () => {
    const toExport = selectedEntries.length > 0 ? selectedEntries : entries;
    downloadDirectoryCsv(toExport, 'directorio-envio-masivo.csv');
  };

  const hasFilters = Boolean(searchTerm || classificationFilter || statusFilter || sourceFilter);
  const totalPages = Math.max(1, Math.ceil(totalCount / ROWS_PER_PAGE));
  const overLimit = recipientCount > BULK_SEND_MAX_RECIPIENTS;

  const filterChip = (
    label: string,
    active: boolean,
    onClick: () => void,
    color?: 'primary' | 'info' | 'warning' | 'success' | 'error' | 'default',
  ) => (
    <Chip
      label={label}
      size="small"
      variant={active ? 'filled' : 'outlined'}
      color={active ? color : undefined}
      onClick={onClick}
      sx={{ cursor: 'pointer', fontWeight: active ? 600 : 400 }}
    />
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 2, minHeight: 0, flex: 1 }}>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1.5 }}>
          <Chip icon={<PeopleIcon />} label={`${totalCount.toLocaleString('es-CO')} con teléfono`} size="small" variant="outlined" />
          <Chip
            label={`${recipientCount.toLocaleString('es-CO')} seleccionados`}
            size="small"
            color={recipientCount > 0 ? 'primary' : 'default'}
          />
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Actualizar lista">
            <IconButton size="small" onClick={() => void fetchEntries()} aria-label="Actualizar">
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1 }}>
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
            sx={{ flex: '1 1 240px', minWidth: 180 }}
          />
          <Tooltip title="Filtros">
            <IconButton
              size="small"
              onClick={() => setShowFilters(!showFilters)}
              color={hasFilters ? 'primary' : 'default'}
              aria-label="Filtros"
            >
              <FilterListIcon />
            </IconButton>
          </Tooltip>
        </Stack>

        <Collapse in={showFilters}>
          <Stack spacing={1.5} sx={{ mb: 1.5, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" alignItems="center">
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                Tipo:
              </Typography>
              {['', 'user', 'company', 'lead', 'unknown'].map((key) =>
                filterChip(
                  key ? CLASSIFICATION_LABELS[key] : 'Todas',
                  classificationFilter === key,
                  () => {
                    setClassificationFilter(key);
                    setPage(0);
                  },
                  key === 'user' ? 'primary' : key === 'lead' ? 'warning' : undefined,
                ),
              )}
            </Stack>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" alignItems="center">
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                Estado:
              </Typography>
              {(['', 'active', 'inactive', 'opt_out'] as const).map((key) => {
                const chip = filterChip(
                  key ? DIRECTORY_STATUS_LABELS[key] : 'Todos',
                  statusFilter === key,
                  () => {
                    setStatusFilter(key);
                    setPage(0);
                  },
                  key && STATUS_CHIP_COLORS[key] !== 'default'
                    ? (STATUS_CHIP_COLORS[key] as 'success' | 'error' | 'warning')
                    : undefined,
                );
                if (!key) return <React.Fragment key="all">{chip}</React.Fragment>;
                return (
                  <Tooltip key={key} title={DIRECTORY_STATUS_SUMMARY[key]} arrow>
                    <span>{chip}</span>
                  </Tooltip>
                );
              })}
            </Stack>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" alignItems="center">
              <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                Origen:
              </Typography>
              {['', 'APP_USER', 'WHATSAPP_INBOUND', 'META_ADS', 'REFERIDO', 'ORGANICO', 'PANEL'].map((key) =>
                filterChip(
                  key ? (SOURCE_LABELS[key] ?? key) : 'Todos',
                  sourceFilter === key,
                  () => {
                    setSourceFilter(key);
                    setPage(0);
                  },
                ),
              )}
            </Stack>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={includeOptOut}
                  onChange={(e) => {
                    setIncludeOptOut(e.target.checked);
                    setPage(0);
                  }}
                />
              }
              label={
                <Typography variant="caption">
                  Incluir opt-out (no recomendado)
                </Typography>
              }
            />
          </Stack>
        </Collapse>

        {(loading || selectAllLoading) && <LinearProgress sx={{ mb: 0.5 }} />}
        {error && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        {overLimit && (
          <Alert severity="warning" icon={<WarningAmberIcon />} sx={{ mb: 1 }}>
            Máximo {BULK_SEND_MAX_RECIPIENTS} destinatarios por envío. Reduce la selección o divide en lotes.
          </Alert>
        )}

        <TableContainer sx={{ flex: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={pageSomeSelected}
                    checked={pageAllSelected}
                    onChange={togglePage}
                    inputProps={{ 'aria-label': 'Seleccionar página' }}
                  />
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Contacto</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Teléfono</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Tipo</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No hay contactos con teléfono para los filtros actuales.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {entries.map((entry) => {
                const name = entry.fullName || entry.displayName || 'Sin nombre';
                const effectiveStatus = getDirectoryEffectiveStatus(entry);
                const checked = selectedIds.has(entry.id);
                return (
                  <TableRow
                    key={entry.id}
                    hover
                    selected={checked}
                    onClick={() => toggleEntry(entry, !checked)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={checked}
                        onChange={(e) => toggleEntry(entry, e.target.checked)}
                        inputProps={{ 'aria-label': `Seleccionar ${name}` }}
                      />
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <ContactAvatar
                          displayName={name}
                          phone={entry.phone}
                          photoUrl={entry.photoUrl}
                          size={28}
                        />
                        <Typography variant="body2" fontWeight={500} noWrap>
                          {name}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {entry.phone}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={CLASSIFICATION_LABELS[entry.classification] ?? entry.classification}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={DIRECTORY_STATUS_LABELS[effectiveStatus]}
                        size="small"
                        color={STATUS_CHIP_COLORS[effectiveStatus]}
                        variant="outlined"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Página {page + 1} de {totalPages} · {totalCount.toLocaleString('es-CO')} elegibles
          </Typography>
          <Stack direction="row" spacing={0.5}>
            <Button size="small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button size="small" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Siguiente
            </Button>
          </Stack>
        </Stack>
      </Box>

      <Box
        sx={{
          width: { xs: '100%', lg: 280 },
          flexShrink: 0,
          p: 2,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
        }}
      >
        <Typography variant="subtitle2" fontWeight={700}>
          Resumen de audiencia
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {recipientCount.toLocaleString('es-CO')} destinatarios listos para enviar
          {manualPhonesRaw.trim() ? ' (incluye números manuales)' : ''}.
        </Typography>

        <Button
          variant="outlined"
          size="small"
          startIcon={selectAllLoading ? undefined : <PeopleIcon />}
          disabled={selectAllLoading || loading}
          onClick={() => void handleSelectAllFiltered()}
          sx={{ textTransform: 'none' }}
        >
          {selectAllLoading ? 'Seleccionando…' : 'Seleccionar todos filtrados'}
        </Button>

        <Button
          variant="outlined"
          size="small"
          startIcon={<DownloadIcon />}
          onClick={handleDownloadCsv}
          disabled={selectedEntries.length === 0 && entries.length === 0}
          sx={{ textTransform: 'none' }}
        >
          Descargar CSV
        </Button>

        <Divider />

        <Button
          size="small"
          endIcon={
            <ExpandMoreIcon
              sx={{ transform: manualExpanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
            />
          }
          onClick={() => setManualExpanded(!manualExpanded)}
          sx={{ textTransform: 'none', justifyContent: 'space-between' }}
        >
          Agregar números manualmente
        </Button>
        <Collapse in={manualExpanded}>
          <TextField
            fullWidth
            multiline
            rows={4}
            size="small"
            placeholder={'573001234567\n573009876543'}
            value={manualPhonesRaw}
            onChange={(e) => onManualPhonesRawChange(e.target.value)}
            helperText="Un número por línea o separados por coma"
          />
        </Collapse>
      </Box>
    </Box>
  );
};

export default BulkSendAudienceStep;
