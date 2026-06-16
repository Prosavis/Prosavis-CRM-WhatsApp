import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  List,
  ListItemButton,
  ListItemText,
  Radio,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { ContactAvatar } from '@/components/common/ContactAvatar';
import {
  forwardWhatsAppMessages,
  isForwardableMessage,
  type ForwardWhatsAppResult,
} from '@/services/forwardWhatsAppMessage';
import { directoryService } from '@/services/directoryService';
import {
  ensureWhatsAppConversationFromLead,
  refetchConversations,
  type WhatsAppConversation,
  type WhatsAppMessage,
} from '@/services/whatsappService';
import type { DirectoryEntry } from '@/types/lead';
import { isWhatsAppConversationLastActiveWithin24h } from '@/utils/whatsappInboxStats';

type PickerTab = 'conversations' | 'directory';

type DestinationSelection =
  | { kind: 'conversation'; conversation: WhatsAppConversation }
  | { kind: 'directory'; entry: DirectoryEntry };

export interface ForwardMessageDialogProps {
  open: boolean;
  onClose: () => void;
  messages: WhatsAppMessage[];
  sourceConversationId: string;
  phoneNumberId?: string;
  onForwarded?: (result: ForwardWhatsAppResult) => void;
}

function getConversationLabel(c: WhatsAppConversation): string {
  return (
    c.contactName ||
    c.whatsappProfileName ||
    c.contactPhone ||
    c.phone ||
    c.id
  );
}

function getDirectoryLabel(entry: DirectoryEntry): string {
  return entry.displayName || entry.fullName || entry.phone || entry.email || entry.id;
}

const ForwardMessageDialog: React.FC<ForwardMessageDialogProps> = ({
  open,
  onClose,
  messages,
  sourceConversationId,
  phoneNumberId,
  onForwarded,
}) => {
  const [tab, setTab] = useState<PickerTab>('conversations');
  const [search, setSearch] = useState('');
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [directoryResults, setDirectoryResults] = useState<DirectoryEntry[]>([]);
  const [loadingDirectory, setLoadingDirectory] = useState(false);
  const [selection, setSelection] = useState<DestinationSelection | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const forwardableCount = useMemo(
    () => messages.filter(isForwardableMessage).length,
    [messages],
  );
  const skippedCount = messages.length - forwardableCount;

  const resetState = useCallback(() => {
    setTab('conversations');
    setSearch('');
    setSelection(null);
    setError(null);
    setPartialErrors([]);
    setProgress(null);
    setDirectoryResults([]);
  }, []);

  useEffect(() => {
    if (!open) return;
    resetState();
    setLoadingConversations(true);
    void refetchConversations(phoneNumberId)
      .then(setConversations)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'No se pudieron cargar las conversaciones');
      })
      .finally(() => setLoadingConversations(false));
  }, [open, phoneNumberId, resetState]);

  useEffect(() => {
    if (!open || tab !== 'directory') return;
    const term = search.trim();
    if (!term) {
      setDirectoryResults([]);
      return;
    }

    const timer = window.setTimeout(() => {
      setLoadingDirectory(true);
      void directoryService
        .search(term)
        .then((entries) => setDirectoryResults(entries.filter((e) => e.phone && !e.optOut)))
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Error al buscar en directorio');
        })
        .finally(() => setLoadingDirectory(false));
    }, 300);

    return () => window.clearTimeout(timer);
  }, [open, tab, search]);

  const filteredConversations = useMemo(() => {
    let list = conversations.filter((c) => c.id !== sourceConversationId);
    if (search.trim() && tab === 'conversations') {
      const term = search.toLowerCase();
      list = list.filter(
        (c) =>
          getConversationLabel(c).toLowerCase().includes(term) ||
          c.contactPhone?.includes(term) ||
          c.phone?.includes(term) ||
          c.id.includes(term),
      );
    }
    return list.sort((a, b) => {
      const aTime = a.lastMessageAt?.getTime() || 0;
      const bTime = b.lastMessageAt?.getTime() || 0;
      return bTime - aTime;
    });
  }, [conversations, sourceConversationId, search, tab]);

  const selectedConversation = selection?.kind === 'conversation' ? selection.conversation : null;
  const destinationWithin24h = selectedConversation
    ? isWhatsAppConversationLastActiveWithin24h(selectedConversation)
    : null;

  const destinationLabel = selection
    ? selection.kind === 'conversation'
      ? getConversationLabel(selection.conversation)
      : getDirectoryLabel(selection.entry)
    : null;

  const handleClose = useCallback(() => {
    if (sending) return;
    onClose();
  }, [sending, onClose]);

  const resolveDestinationStableKey = useCallback(async (): Promise<string> => {
    if (!selection) {
      throw new Error('Selecciona un destino.');
    }
    if (selection.kind === 'conversation') {
      return selection.conversation.id;
    }
    const phone = selection.entry.phone?.trim();
    if (!phone) {
      throw new Error('El contacto del directorio no tiene teléfono.');
    }
    const result = await ensureWhatsAppConversationFromLead({
      phone,
      name: getDirectoryLabel(selection.entry),
      phoneNumberId,
    });
    return result.conversationId;
  }, [selection, phoneNumberId]);

  const handleForward = useCallback(async () => {
    setError(null);
    setPartialErrors([]);
    setSending(true);
    setProgress(null);

    try {
      const destinationStableKey = await resolveDestinationStableKey();
      const result = await forwardWhatsAppMessages(messages, destinationStableKey, {
        phoneNumberId,
        sourceStableKeyHint: sourceConversationId,
        onProgress: (current, total) => setProgress({ current, total }),
      });

      if (result.errors.length > 0) {
        setPartialErrors(result.errors.map((e) => e.error));
      }

      onForwarded?.(result);

      if (result.failed === 0) {
        onClose();
      } else if (result.sent > 0) {
        setError(`${result.sent} de ${result.sent + result.failed} mensaje(s) reenviados.`);
      } else {
        setError('No se pudo reenviar ningún mensaje.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al reenviar';
      if (msg.includes('bloqueado')) {
        setError('Este número está bloqueado');
      } else if (msg.includes('opt-out')) {
        setError('Este contacto tiene opt-out activo');
      } else {
        setError(msg);
      }
    } finally {
      setSending(false);
      setProgress(null);
    }
  }, [
    messages,
    phoneNumberId,
    sourceConversationId,
    resolveDestinationStableKey,
    onForwarded,
    onClose,
  ]);

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Reenviar mensaje{messages.length !== 1 ? 's' : ''}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {forwardableCount} mensaje(s) reenviable(s)
          {skippedCount > 0 ? ` · ${skippedCount} omitido(s)` : ''}
        </Typography>

        {destinationLabel && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Destino: <strong>{destinationLabel}</strong>
          </Alert>
        )}

        {selectedConversation && destinationWithin24h === false && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Esta conversación está fuera de la ventana de 24 h. El reenvío de texto o media libre
            puede fallar en WhatsApp; considera usar una plantilla.
          </Alert>
        )}

        {error && (
          <Alert severity={partialErrors.length > 0 ? 'warning' : 'error'} sx={{ mb: 2 }}>
            {error}
            {partialErrors.length > 0 && (
              <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
                {partialErrors.map((item) => (
                  <li key={item}>
                    <Typography variant="caption">{item}</Typography>
                  </li>
                ))}
              </Box>
            )}
          </Alert>
        )}

        <Tabs
          value={tab}
          onChange={(_, value: PickerTab) => {
            setTab(value);
            setSelection(null);
            setSearch('');
          }}
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Conversaciones" value="conversations" />
          <Tab label="Directorio" value="directory" />
        </Tabs>

        <TextField
          fullWidth
          size="small"
          placeholder={tab === 'conversations' ? 'Buscar conversación…' : 'Buscar en directorio…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />

        <Box sx={{ minHeight: 280, maxHeight: 360, overflow: 'auto' }}>
          {tab === 'conversations' ? (
            loadingConversations ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={28} />
              </Box>
            ) : filteredConversations.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                No hay conversaciones que coincidan.
              </Typography>
            ) : (
              <List dense disablePadding>
                {filteredConversations.map((conversation) => {
                  const selected =
                    selection?.kind === 'conversation' &&
                    selection.conversation.id === conversation.id;
                  return (
                    <ListItemButton
                      key={conversation.id}
                      selected={selected}
                      onClick={() => setSelection({ kind: 'conversation', conversation })}
                    >
                      <Radio checked={selected} size="small" sx={{ mr: 1 }} tabIndex={-1} />
                      <ContactAvatar
                        displayName={getConversationLabel(conversation)}
                        phone={conversation.contactPhone || conversation.phone}
                        photoUrl={conversation.contactPhotoUrl}
                        size={36}
                      />
                      <ListItemText
                        sx={{ ml: 1.5 }}
                        primary={getConversationLabel(conversation)}
                        secondary={conversation.contactPhone || conversation.phone}
                        primaryTypographyProps={{ noWrap: true }}
                        secondaryTypographyProps={{ noWrap: true }}
                      />
                    </ListItemButton>
                  );
                })}
              </List>
            )
          ) : loadingDirectory ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : !search.trim() ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              Escribe para buscar contactos en el directorio CRM.
            </Typography>
          ) : directoryResults.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              Sin resultados en el directorio.
            </Typography>
          ) : (
            <List dense disablePadding>
              {directoryResults.map((entry) => {
                const selected =
                  selection?.kind === 'directory' && selection.entry.id === entry.id;
                return (
                  <ListItemButton
                    key={entry.id}
                    selected={selected}
                    onClick={() => setSelection({ kind: 'directory', entry })}
                  >
                    <Radio checked={selected} size="small" sx={{ mr: 1 }} tabIndex={-1} />
                    <ContactAvatar
                      displayName={getDirectoryLabel(entry)}
                      phone={entry.phone}
                      photoUrl={entry.photoUrl}
                      size={36}
                    />
                    <ListItemText
                      sx={{ ml: 1.5 }}
                      primary={getDirectoryLabel(entry)}
                      secondary={entry.phone || entry.email}
                      primaryTypographyProps={{ noWrap: true }}
                      secondaryTypographyProps={{ noWrap: true }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Box>

        {progress && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            Enviando {progress.current} de {progress.total}…
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={sending}>
          Cancelar
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleForward()}
          disabled={!selection || sending || forwardableCount === 0}
          startIcon={sending ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          Reenviar
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ForwardMessageDialog;
