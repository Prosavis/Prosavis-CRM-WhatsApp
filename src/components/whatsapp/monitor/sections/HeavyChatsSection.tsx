import React, { useState } from 'react';
import {
  Box, Stack, Typography, Button, Chip, IconButton, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Alert, CircularProgress, LinearProgress, useTheme,
} from '@mui/material';
import {
  Chat as ChatIcon, Warning as WarningIcon, DeleteSweep as DeleteSweepIcon,
  ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import BentoCard from '../ui/BentoCard';
import { supabase } from '@/config/supabase';
import type { HeavyChat } from '@/services/monitorService';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString('es-CO');
}

interface HeavyChatsSectionProps {
  chats: HeavyChat[];
  loading: boolean;
  onRefresh: () => void;
}

const HeavyChatsSection: React.FC<HeavyChatsSectionProps> = ({ chats, loading, onRefresh }) => {
  const [expanded, setExpanded] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; chat: HeavyChat | null; mode: 'media' | 'chat' }>({
    open: false, chat: null, mode: 'media',
  });
  const [deleting, setDeleting] = useState(false);
  const theme = useTheme();

  const handleDeleteMedia = (chat: HeavyChat) => setDeleteDialog({ open: true, chat, mode: 'media' });
  const handleDeleteChat = (chat: HeavyChat) => setDeleteDialog({ open: true, chat, mode: 'chat' });

  const confirmDelete = async () => {
    if (!deleteDialog.chat) return;
    setDeleting(true);
    try {
      if (deleteDialog.mode === 'media') {
        await supabase.from('whatsapp_media_assets').delete().eq('conversation_stable_key', deleteDialog.chat.stableKey);
      } else {
        await supabase.from('whatsapp_conversations').delete().eq('stable_key', deleteDialog.chat.stableKey);
      }
      setDeleteDialog({ open: false, chat: null, mode: 'media' });
      onRefresh();
    } catch (e) {
      console.error('Error eliminando:', e);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <BentoCard>
        <Box sx={{ height: 200, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <CircularProgress size={24} />
        </Box>
      </BentoCard>
    );
  }

  if (chats.length === 0) {
    return (
      <BentoCard>
        <Stack alignItems="center" spacing={1} sx={{ py: 3 }}>
          <ChatIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
          <Typography variant="body2" color="text.secondary">No hay conversaciones pesadas</Typography>
        </Stack>
      </BentoCard>
    );
  }

  const displayChats = expanded ? chats : chats.slice(0, 5);
  const maxBytes = Math.max(...chats.map((c) => c.totalBytes), 1);

  const medalIcon = (i: number) => {
    if (i === 0) return <Typography sx={{ fontSize: 18, lineHeight: 1 }}>🥇</Typography>;
    if (i === 1) return <Typography sx={{ fontSize: 18, lineHeight: 1 }}>🥈</Typography>;
    if (i === 2) return <Typography sx={{ fontSize: 18, lineHeight: 1 }}>🥉</Typography>;
    return <Typography variant="caption" fontWeight={700} color="text.disabled">{i + 1}</Typography>;
  };

  const rowVariants = {
    hidden: { opacity: 0, x: -8 },
    visible: (i: number) => ({ opacity: 1, x: 0, transition: { duration: 0.3, delay: i * 0.06 } }),
  };

  return (
    <>
      <BentoCard>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <ChatIcon color="warning" />
          <Typography variant="subtitle2" fontWeight={600} sx={{ flex: 1 }}>
            Chats más pesados
          </Typography>
          <Chip label={`${chats.length} chats`} size="small" variant="outlined" />
          {chats.length > 5 && (
            <Button
              size="small"
              endIcon={expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? 'Mostrar menos' : `Ver todos (${chats.length})`}
            </Button>
          )}
        </Stack>

        <AnimatePresence mode="wait">
          {!expanded ? (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Stack spacing={1}>
                {displayChats.map((chat, i) => {
                  const pct = (chat.totalBytes / maxBytes) * 100;
                  return (
                    <motion.div
                      key={chat.stableKey}
                      variants={rowVariants} custom={i} initial="hidden" animate="visible"
                    >
                      <Box
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 1.5,
                          px: 1.5, py: 1, borderRadius: 1,
                          '&:hover': { bgcolor: 'action.hover' }, cursor: 'pointer',
                        }}
                        onClick={() => handleDeleteMedia(chat)}
                      >
                        {medalIcon(i)}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" fontWeight={600} noWrap>
                            {chat.contactName || chat.contactPhone || 'Sin nombre'}
                          </Typography>
                          <LinearProgress
                            variant="determinate" value={pct}
                            sx={{
                              height: 4, borderRadius: 2, mt: 0.5, bgcolor: 'action.hover',
                              '& .MuiLinearProgress-bar': {
                                bgcolor: chat.totalBytes > 10_485_760 ? 'error.main' : 'warning.main',
                                borderRadius: 2,
                              },
                            }}
                          />
                        </Box>
                        <Typography variant="body2" fontWeight={700} fontFamily="'JetBrains Mono', monospace" sx={{ flexShrink: 0 }}>
                          {formatBytes(chat.totalBytes)}
                        </Typography>
                      </Box>
                    </motion.div>
                  );
                })}
              </Stack>
            </motion.div>
          ) : (
            <motion.div key="table" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: theme.palette.mode === 'dark' ? 'action.hover' : 'grey.50' }}>
                      <TableCell sx={{ fontWeight: 600, pl: 2 }}>#</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Contacto</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Teléfono</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Msgs</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Mult.</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Peso</TableCell>
                      <TableCell sx={{ fontWeight: 600, pr: 2 }} align="center">Acción</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {chats.map((chat, i) => (
                      <TableRow key={chat.stableKey} hover
                        sx={i < 3 ? { '& .MuiTableCell-root': { borderLeft: '3px solid', borderColor: 'warning.main' } } : undefined}
                      >
                        <TableCell sx={{ pl: 2 }}>{medalIcon(i)}</TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 160 }}>
                            {chat.contactName || 'Sin nombre'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" fontFamily="'JetBrains Mono', monospace">
                            {chat.contactPhone || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{formatNumber(chat.messageCount)}</TableCell>
                        <TableCell align="right">
                          <Chip label={chat.mediaCount} size="small" color={chat.mediaCount > 10 ? 'warning' : 'default'} variant="outlined" />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={700}
                            color={chat.totalBytes > 10_485_760 ? 'error.main' : 'text.primary'}
                            fontFamily="'JetBrains Mono', monospace"
                          >
                            {formatBytes(chat.totalBytes)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center" sx={{ pr: 2 }}>
                          <Stack direction="row" spacing={0.5} justifyContent="center">
                            <Tooltip title="Eliminar multimedia">
                              <IconButton size="small" color="warning" onClick={() => handleDeleteMedia(chat)}>
                                <DeleteSweepIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Eliminar todo el chat">
                              <IconButton size="small" color="error" onClick={() => handleDeleteChat(chat)}>
                                <WarningIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </motion.div>
          )}
        </AnimatePresence>

        <Box sx={{ mt: 1.5, px: 1, py: 0.75, bgcolor: 'action.hover', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            <WarningIcon sx={{ fontSize: 12, verticalAlign: 'text-bottom', mr: 0.5 }} />
            Al eliminar un chat completo se borran también todos sus mensajes y archivos
          </Typography>
        </Box>
      </BentoCard>

      <Dialog
        open={deleteDialog.open}
        onClose={() => !deleting && setDeleteDialog({ open: false, chat: null, mode: 'media' })}
        maxWidth="sm" fullWidth
      >
        <DialogTitle>{deleteDialog.mode === 'media' ? 'Eliminar multimedia' : 'Eliminar todo el chat'}</DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            {deleteDialog.mode === 'media' ? (
              <Box>
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Se eliminarán todos los archivos multimedia de esta conversación.
                </Alert>
                <Typography variant="body2">
                  <strong>Chat:</strong> {deleteDialog.chat?.contactName || deleteDialog.chat?.contactPhone || 'Desconocido'}
                </Typography>
                <Typography variant="body2">
                  <strong>Multimedia:</strong> {deleteDialog.chat?.mediaCount} archivos ({deleteDialog.chat ? formatBytes(deleteDialog.chat.totalBytes) : '—'})
                </Typography>
              </Box>
            ) : (
              <Box>
                <Alert severity="error" sx={{ mb: 2 }}>
                  Esta acción eliminará <strong>toda la conversación</strong>, incluyendo mensajes y archivos. No se puede deshacer.
                </Alert>
                <Typography variant="body2"><strong>Chat:</strong> {deleteDialog.chat?.contactName || deleteDialog.chat?.contactPhone || 'Desconocido'}</Typography>
                <Typography variant="body2"><strong>Mensajes:</strong> {deleteDialog.chat?.messageCount}</Typography>
                <Typography variant="body2"><strong>Multimedia:</strong> {deleteDialog.chat?.mediaCount} archivos</Typography>
              </Box>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, chat: null, mode: 'media' })} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color={deleteDialog.mode === 'chat' ? 'error' : 'warning'}
            onClick={confirmDelete}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={16} color="inherit" /> : undefined}
          >
            {deleting ? 'Eliminando...' : deleteDialog.mode === 'media' ? 'Eliminar multimedia' : 'Eliminar todo'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default HeavyChatsSection;
