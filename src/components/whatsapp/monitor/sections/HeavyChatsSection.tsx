import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Stack, Typography, Button, Chip, IconButton, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Alert, CircularProgress, LinearProgress, useTheme,
  TablePagination, FormControl, InputLabel, Select, MenuItem, Checkbox, FormControlLabel,
} from '@mui/material';
import {
  Chat as ChatIcon, Warning as WarningIcon, DeleteSweep as DeleteSweepIcon,
} from '@mui/icons-material';
import BentoCard from '../ui/BentoCard';
import {
  getConversationRanking,
  deleteConversationMedia,
  DELETE_CONVERSATION_MEDIA_CONFIRM,
  type HeavyChat,
} from '@/services/monitorService';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO');
}

type SortField = 'bytes' | 'messages' | 'date' | 'media';

interface HeavyChatsSectionProps {
  initialChats: HeavyChat[];
  totalCount: number;
  loading: boolean;
  onRefresh: () => void;
}

const HeavyChatsSection: React.FC<HeavyChatsSectionProps> = ({
  initialChats,
  totalCount,
  loading,
  onRefresh,
}) => {
  const [chats, setChats] = useState<HeavyChat[]>(initialChats);
  const [total, setTotal] = useState(totalCount);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sort, setSort] = useState<SortField>('bytes');
  const [fetching, setFetching] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; chat: HeavyChat | null; mode: 'media' | 'chat' }>({
    open: false, chat: null, mode: 'media',
  });
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();

  const loadPage = useCallback(async () => {
    setFetching(true);
    setError(null);
    try {
      const { rows, totalCount: count } = await getConversationRanking({
        limit: rowsPerPage,
        offset: page * rowsPerPage,
        sort,
      });
      setChats(rows);
      setTotal(count);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando ranking');
    } finally {
      setFetching(false);
    }
  }, [page, rowsPerPage, sort]);

  useEffect(() => {
    setChats(initialChats);
    setTotal(totalCount);
  }, [initialChats, totalCount]);

  useEffect(() => {
    if (page === 0 && sort === 'bytes' && rowsPerPage === 10) return;
    loadPage();
  }, [page, rowsPerPage, sort, loadPage]);

  const handleDeleteMedia = (chat: HeavyChat) => {
    setConfirmed(false);
    setDeleteDialog({ open: true, chat, mode: 'media' });
  };

  const confirmDelete = async () => {
    if (!deleteDialog.chat) return;
    setDeleting(true);
    setError(null);
    try {
      if (deleteDialog.mode === 'media') {
        await deleteConversationMedia({
          stableKey: deleteDialog.chat.stableKey,
          dryRun: false,
          confirmPhrase: DELETE_CONVERSATION_MEDIA_CONFIRM,
        });
      }
      setDeleteDialog({ open: false, chat: null, mode: 'media' });
      onRefresh();
      await loadPage();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error eliminando media');
    } finally {
      setDeleting(false);
    }
  };

  const maxBytes = Math.max(...chats.map((c) => c.totalBytes), 1);

  const medalIcon = (i: number) => {
    const globalIndex = page * rowsPerPage + i;
    if (globalIndex === 0) return <Typography sx={{ fontSize: 18, lineHeight: 1 }}>🥇</Typography>;
    if (globalIndex === 1) return <Typography sx={{ fontSize: 18, lineHeight: 1 }}>🥈</Typography>;
    if (globalIndex === 2) return <Typography sx={{ fontSize: 18, lineHeight: 1 }}>🥉</Typography>;
    return <Typography variant="caption" fontWeight={700} color="text.disabled">{globalIndex + 1}</Typography>;
  };

  if (loading && chats.length === 0) {
    return (
      <BentoCard>
        <Box sx={{ height: 200, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <CircularProgress size={24} />
        </Box>
      </BentoCard>
    );
  }

  return (
    <>
      <BentoCard>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <ChatIcon color="warning" />
          <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
            Chats por peso (Storage real)
          </Typography>
          <Chip label={`${total} con media`} size="small" variant="outlined" />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Ordenar</InputLabel>
            <Select
              value={sort}
              label="Ordenar"
              onChange={(e) => { setSort(e.target.value as SortField); setPage(0); }}
            >
              <MenuItem value="bytes">Peso</MenuItem>
              <MenuItem value="messages">Mensajes</MenuItem>
              <MenuItem value="media">Archivos</MenuItem>
              <MenuItem value="date">Último msg</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {chats.length === 0 ? (
          <Stack alignItems="center" spacing={1} sx={{ py: 3 }}>
            <ChatIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
            <Typography variant="body2" color="text.secondary">No hay conversaciones con media en Storage</Typography>
          </Stack>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: theme.palette.mode === 'dark' ? 'action.hover' : 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, pl: 2 }}>#</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Contacto</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Msgs</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Mult.</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Peso</TableCell>
                    <TableCell sx={{ fontWeight: 600, pr: 2 }} align="center">Acción</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {chats.map((chat, i) => {
                    const pct = (chat.totalBytes / maxBytes) * 100;
                    return (
                      <TableRow key={chat.stableKey} hover>
                        <TableCell sx={{ pl: 2 }}>{medalIcon(i)}</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 180 }}>
                            {chat.contactName || chat.contactPhone || 'Sin nombre'}
                          </Typography>
                          {chat.contactPhone && chat.contactName && (
                            <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                              {chat.contactPhone}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">{formatNumber(chat.messageCount)}</TableCell>
                        <TableCell align="right">
                          <Chip label={chat.mediaCount} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={700} fontFamily="monospace"
                            color={chat.totalBytes > 10_485_760 ? 'error.main' : 'text.primary'}
                          >
                            {formatBytes(chat.totalBytes)}
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={pct}
                            sx={{
                              height: 4, borderRadius: 2, mt: 0.5, maxWidth: 120,
                              '& .MuiLinearProgress-bar': {
                                bgcolor: chat.totalBytes > 10_485_760 ? 'error.main' : 'warning.main',
                              },
                            }}
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ pr: 2 }}>
                          <Tooltip title="Eliminar multimedia (Storage + DB)">
                            <IconButton size="small" color="warning" onClick={() => handleDeleteMedia(chat)}>
                              <DeleteSweepIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => {
                setRowsPerPage(parseInt(e.target.value, 10));
                setPage(0);
              }}
              rowsPerPageOptions={[5, 10, 20, 50]}
              labelRowsPerPage="Filas"
              disabled={fetching}
            />
          </>
        )}

        {fetching && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
            <CircularProgress size={20} />
          </Box>
        )}

        <Box sx={{ mt: 1, px: 1, py: 0.75, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            <WarningIcon sx={{ fontSize: 12, verticalAlign: 'text-bottom', mr: 0.5 }} />
            Bytes desde storage.objects (fuente de verdad). Borrado vía Edge Function.
          </Typography>
        </Box>
      </BentoCard>

      <Dialog
        open={deleteDialog.open}
        onClose={() => !deleting && setDeleteDialog({ open: false, chat: null, mode: 'media' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Eliminar multimedia del chat</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Alert severity="warning" sx={{ mb: 2 }}>
              Se eliminarán objetos en Storage y filas en la base de datos. No se puede deshacer.
            </Alert>
            <Typography variant="body2">
              <strong>Chat:</strong> {deleteDialog.chat?.contactName || deleteDialog.chat?.contactPhone || 'Desconocido'}
            </Typography>
            <Typography variant="body2">
              <strong>Multimedia:</strong> {deleteDialog.chat?.mediaCount} archivos ({deleteDialog.chat ? formatBytes(deleteDialog.chat.totalBytes) : '—'})
            </Typography>
            <FormControlLabel
              sx={{ mt: 2 }}
              control={<Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />}
              label="Entiendo que no se puede deshacer"
            />
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, chat: null, mode: 'media' })} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={confirmDelete}
            disabled={deleting || !confirmed}
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {deleting ? 'Eliminando...' : 'Eliminar multimedia'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default HeavyChatsSection;
