import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import SearchIcon from '@mui/icons-material/Search';
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Pagination,
  Stack,
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
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { inboxQueryKeys } from '@/hooks/inboxQueryKeys';
import DirectoryEntryDrawer from '@/components/directory/DirectoryEntryDrawer';
import DirectoryEditDialog from '@/components/directory/DirectoryEditDialog';
import { DirectoryCancellationHistory } from '@/components/directory/DirectoryCancellationHistory';
import { directoryService } from '@/services/directoryService';
import {
  useDirectoryWorkspaceCancellations,
  useDirectoryWorkspacePage,
} from '@/hooks/useDirectoryWorkspaceQueries';
import type { DirectoryEntry } from '@/types/lead';
import type { DirectoryWorkspaceSegment, DirectoryWorkspaceView } from '@/utils/directoryWorkspace';
import {
  cancellationReasonLabel,
  derivePaymentDisplay,
} from '@/utils/directoryWorkspace';

const PAYMENT_LABELS = {
  AL_DIA: 'pago completado',
  PENDIENTE: 'pago pendiente',
  EN_PROCESO: 'pago parcial',
  SIN_HISTORIAL: 'Sin historial',
} as const;

function fmtDate(value: string | null): string {
  if (!value) return '—';
  try {
    return format(new Date(value), 'd MMM yyyy', { locale: es });
  } catch {
    return '—';
  }
}

export function DirectorySegmentTable({
  view,
  segment = null,
  searchSeed = '',
  clientId,
  onClientHandled,
  onOpenInInbox,
}: {
  view: DirectoryWorkspaceView;
  segment?: DirectoryWorkspaceSegment | null;
  searchSeed?: string;
  clientId?: string | null;
  onClientHandled?: () => void;
  onOpenInInbox?: (phone: string, name?: string) => void;
}) {
  const [searchInput, setSearchInput] = useState(searchSeed);
  const [search, setSearch] = useState(searchSeed);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<DirectoryEntry | null>(null);
  const [editEntry, setEditEntry] = useState<DirectoryEntry | null>(null);
  const queryClient = useQueryClient();
  const limit = 25;
  const query = useDirectoryWorkspacePage({
    view,
    search,
    segment,
    limit,
    offset: page * limit,
  });
  const cancellations = useDirectoryWorkspaceCancellations(selected?.id ?? null);
  const items = query.data?.items ?? [];
  const matchedCount = query.data?.matchedCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(matchedCount / limit));

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (!clientId) return;
    void directoryService.getEntryById(clientId).then((entry) => {
      if (entry) setSelected(entry);
      onClientHandled?.();
    });
  }, [clientId, onClientHandled]);

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          size="small"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={view === 'canceled' ? 'Buscar nombre, teléfono o motivo' : 'Buscar nombre, email o teléfono'}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ minWidth: { sm: 360 } }}
        />
      </Stack>
      {query.isPending && items.length === 0 ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : query.error && items.length === 0 ? (
        <Typography color="error">{query.error instanceof Error ? query.error.message : 'No se pudo cargar el directorio.'}</Typography>
      ) : items.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>
          {view === 'canceled' ? 'No hay cancelaciones ni rechazos.' : 'No hay clientes agendados.'}
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Cliente</TableCell>
                <TableCell>Clasificación</TableCell>
                {view !== 'canceled' ? (
                  <>
                    <TableCell>Total citas</TableCell>
                    <TableCell>Última cita</TableCell>
                    <TableCell>Próxima cita</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell>Último motivo</TableCell>
                    <TableCell>Incidencias</TableCell>
                  </>
                )}
                <TableCell>Pago</TableCell>
                <TableCell align="right">Adeuda</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((row) => {
                const payment = derivePaymentDisplay(row.lastCompletedPaymentStatus);
                return (
                  <TableRow
                    key={row.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => {
                      void directoryService.getEntryById(row.id).then((entry) => {
                        if (entry) setSelected(entry);
                      });
                    }}
                  >
                    <TableCell>
                      <Typography fontWeight={600}>{row.displayName || row.fullName || row.phone || 'Sin nombre'}</Typography>
                      <Typography variant="caption" color="text.secondary">{row.phone || row.email || '—'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" label={row.classification || '—'} variant="outlined" />
                    </TableCell>
                    {view !== 'canceled' ? (
                      <>
                        <TableCell>{row.appointmentCount}</TableCell>
                        <TableCell>{fmtDate(row.lastAppointmentAt)}</TableCell>
                        <TableCell>{fmtDate(row.nextAppointmentAt)}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>
                          {cancellationReasonLabel(row.latestCancellationReason)}
                          {row.latestCancellationReasonOther ? (
                            <Typography variant="caption" display="block" color="text.secondary">
                              {row.latestCancellationReasonOther}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell>{row.cancellationCount}</TableCell>
                      </>
                    )}
                    <TableCell>
                      <Chip size="small" label={PAYMENT_LABELS[payment]} variant="outlined" />
                    </TableCell>
                    <TableCell align="right">
                      {row.computedDebt > 0 ? `$${row.computedDebt.toLocaleString('es-CO')}` : '—'}
                    </TableCell>
                    <TableCell align="right" onClick={(event) => event.stopPropagation()}>
                      {row.phone && onOpenInInbox ? (
                        <Tooltip title="Abrir en inbox">
                          <IconButton size="small" onClick={() => onOpenInInbox(row.phone as string, row.displayName || row.fullName)}>
                            <WhatsAppIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {pageCount > 1 ? (
        <Pagination
          sx={{ mt: 2 }}
          page={page + 1}
          count={pageCount}
          onChange={(_, next) => setPage(next - 1)}
        />
      ) : null}

      <DirectoryEntryDrawer
        open={Boolean(selected)}
        entry={selected}
        onClose={() => setSelected(null)}
        onEdit={(entry) => {
          setEditEntry(entry);
        }}
        extraContent={view === 'canceled' ? (
          <Box sx={{ mb: 3 }}>
            <Typography variant="overline" display="block" sx={{ mb: 1.5, color: 'text.secondary' }}>
              Historial de cancelaciones
            </Typography>
            <DirectoryCancellationHistory
              incidents={cancellations.data ?? []}
              loading={cancellations.isPending}
            />
          </Box>
        ) : null}
      />
      {editEntry ? (
        <DirectoryEditDialog
          open
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={(entry) => {
            setSelected(entry);
            setEditEntry(null);
            void queryClient.invalidateQueries({ queryKey: inboxQueryKeys.directoryWorkspaceRoot() });
          }}
        />
      ) : null}
    </Box>
  );
}
