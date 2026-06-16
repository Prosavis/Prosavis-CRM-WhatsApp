import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Badge,
  Typography,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  Popover,
  Menu,
  MenuItem,
  ListItemIcon,
  IconButton,
  Tooltip,
  Checkbox,
  CircularProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PushPinIcon from '@mui/icons-material/PushPin';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MarkChatReadIcon from '@mui/icons-material/MarkChatRead';
import MarkChatUnreadIcon from '@mui/icons-material/MarkChatUnread';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import DeleteForeverOutlinedIcon from '@mui/icons-material/DeleteForeverOutlined';
import BlockIcon from '@mui/icons-material/Block';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CloseIcon from '@mui/icons-material/Close';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import type {
  WhatsAppConversation,
  WhatsAppTag,
  WhatsAppAdminPresence,
} from '@/services/whatsappService';
import OutboundPreviewTicks from './OutboundPreviewTicks';
import { ContactAvatar } from '@/components/common/ContactAvatar';
import {
  getDirectoryMetaForConversation,
  useDirectoryContactMeta,
} from '@/hooks/useDirectoryContactMeta';
import { pickContactPhotoUrl } from '@/utils/contactAvatar';
import { resolveContactDisplayName } from '@/utils/contactDisplayName';
import {
  isWhatsAppConversationLastActiveWithin24h,
  type WhatsAppTabCounts,
} from '@/utils/whatsappInboxStats';
import { useLongPress } from '@/hooks/useLongPress';

export type BulkTagMode = 'add' | 'replace';

interface ConversationListProps {
  conversations: WhatsAppConversation[];
  tabCounts: WhatsAppTabCounts;
  tagCountsById: Record<string, number>;
  selectedId: string | null;
  onSelect: (conversation: WhatsAppConversation) => void;
  loading?: boolean;
  tags?: WhatsAppTag[];
  onManageTags?: () => void;
  onNewContact?: () => void;
  /** Presencia de otros admins (excluye al usuario actual) por id de conversación. */
  presenceByConversationId?: Record<string, WhatsAppAdminPresence[]>;
  onMarkReadToggle?: (conversation: WhatsAppConversation) => void;
  onArchiveToggle?: (conversation: WhatsAppConversation) => void;
  onPinToggle?: (conversation: WhatsAppConversation) => void;
  onAssignTags?: (conversation: WhatsAppConversation, tagIds: string[]) => void;
  onDeleteConversation?: (conversation: WhatsAppConversation) => void;
  onBlockConversation?: (conversation: WhatsAppConversation) => void;
  onBulkAssignTags?: (conversationIds: string[], tagIds: string[], mode: BulkTagMode) => Promise<void>;
  onBulkArchive?: (conversationIds: string[], archive: boolean) => Promise<void>;
  onBulkMarkRead?: (conversationIds: string[], read: boolean) => Promise<void>;
  onBulkPin?: (conversationIds: string[], pin: boolean) => Promise<void>;
  onBulkDelete?: (conversationIds: string[]) => Promise<void>;
}

/** Resumen humano para línea secundaria: prioriza "escribiendo" sobre "viendo". */
function summarizePeerPresences(peers: WhatsAppAdminPresence[]): {
  text: string;
  typing: boolean;
} | null {
  if (!peers.length) return null;
  const typing = peers.filter((p) => p.activity === 'typing');
  const viewing = peers.filter((p) => p.activity !== 'typing');
  const formatNames = (list: WhatsAppAdminPresence[]) => {
    const names = list.map((p) => (p.displayName || 'admin').trim()).filter(Boolean);
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} y ${names[1]}`;
    return `${names[0]} y ${names.length - 1} más`;
  };
  if (typing.length > 0) {
    const verb = typing.length === 1 ? 'está escribiendo…' : 'están escribiendo…';
    return { text: `${formatNames(typing)} ${verb}`, typing: true };
  }
  const verb = viewing.length === 1 ? 'en este chat' : 'en este chat';
  return { text: `${formatNames(viewing)} ${verb}`, typing: false };
}

function formatRelativeTime(date?: Date): string {
  if (!date) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return date.toLocaleDateString('es-CO', { weekday: 'short' });
  return date.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

interface InboxFilterTabLabelProps {
  label: string;
  count: number;
  selected: boolean;
  icon?: React.ReactNode;
}

function InboxFilterTabLabel({ label, count, selected, icon }: InboxFilterTabLabelProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.35,
        py: 0.2,
        minWidth: 50,
        maxWidth: 122,
        minHeight: 40,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          gap: 0.4,
          width: '100%',
        }}
      >
        {icon ? (
          <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', height: 18, mt: 0.05 }}>
            {icon}
          </Box>
        ) : null}
        <Typography
          component="span"
          variant="caption"
          sx={{
            lineHeight: 1.2,
            textAlign: 'center',
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            flex: icon ? 1 : undefined,
            minWidth: 0,
          }}
        >
          {label}
        </Typography>
      </Box>
      <Typography
        component="span"
        variant="caption"
        sx={{
          fontWeight: selected ? 700 : 500,
          fontSize: '0.72rem',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          color: selected ? 'primary.main' : 'text.secondary',
        }}
      >
        ({count})
      </Typography>
    </Box>
  );
}

type FilterType = 'last24h' | 'all' | 'unread' | 'tagged' | 'archived';

const INBOX_FILTER_STORAGE_KEY = 'whatsapp-inbox-filter';
const VALID_INBOX_FILTERS: FilterType[] = ['last24h', 'all', 'unread', 'tagged', 'archived'];

function readStoredInboxFilter(): FilterType {
  try {
    const stored = sessionStorage.getItem(INBOX_FILTER_STORAGE_KEY);
    if (stored && VALID_INBOX_FILTERS.includes(stored as FilterType)) {
      return stored as FilterType;
    }
  } catch {
    // sessionStorage puede estar bloqueado
  }
  return 'last24h';
}

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  tabCounts,
  tagCountsById,
  selectedId,
  onSelect,
  loading,
  tags = [],
  onManageTags,
  onNewContact,
  presenceByConversationId,
  onMarkReadToggle,
  onArchiveToggle,
  onPinToggle,
  onAssignTags,
  onDeleteConversation,
  onBlockConversation,
  onBulkAssignTags,
  onBulkArchive,
  onBulkMarkRead,
  onBulkPin,
  onBulkDelete,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>(readStoredInboxFilter);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkTagDialogOpen, setBulkTagDialogOpen] = useState(false);
  const [bulkTagMode, setBulkTagMode] = useState<BulkTagMode>('add');
  const [bulkTagSelection, setBulkTagSelection] = useState<string[]>([]);

  useEffect(() => {
    try {
      sessionStorage.setItem(INBOX_FILTER_STORAGE_KEY, filter);
    } catch {
      // sessionStorage puede estar bloqueado
    }
  }, [filter]);
  const [tagMenuAnchor, setTagMenuAnchor] = useState<null | HTMLElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    conversation: WhatsAppConversation;
  } | null>(null);
  const [assignTagsAnchor, setAssignTagsAnchor] = useState<null | HTMLElement>(null);

  const directoryMetaByPhoneKey = useDirectoryContactMeta(conversations);

  const tagMap = useMemo(() => {
    const map = new Map<string, WhatsAppTag>();
    tags.forEach((t) => map.set(t.id, t));
    return map;
  }, [tags]);

  const toggleTagId = useCallback((id: string) => {
    setSelectedTagIds((prev) => {
      const i = prev.indexOf(id);
      if (i === -1) return [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }, []);

  const filtered = useMemo(() => {
    let result = conversations;

    if (filter === 'archived') {
      result = result.filter((c) => c.isArchived);
    } else {
      result = result.filter((c) => !c.isArchived);
    }

    if (filter === 'last24h') {
      result = result.filter((c) => isWhatsAppConversationLastActiveWithin24h(c));
    } else if (filter === 'unread') {
      result = result.filter((c) => c.unreadCount > 0 || c.crmForceUnread);
    } else if (filter === 'tagged') {
      if (selectedTagIds.length > 0) {
        result = result.filter((c) =>
          selectedTagIds.every((tid) => c.tagIds?.includes(tid)),
        );
      } else {
        result = result.filter((c) => c.tagIds && c.tagIds.length > 0);
      }
    }

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter((c) => {
        const dirMeta = getDirectoryMetaForConversation(c, directoryMetaByPhoneKey);
        return (
          c.contactName?.toLowerCase().includes(term) ||
          c.whatsappProfileName?.toLowerCase().includes(term) ||
          dirMeta?.displayName?.toLowerCase().includes(term) ||
          c.contactPhone?.includes(term) ||
          c.phone?.includes(term) ||
          c.id.includes(term)
        );
      });
    }

    result.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const aTime = a.lastMessageAt?.getTime() || 0;
      const bTime = b.lastMessageAt?.getTime() || 0;
      return bTime - aTime;
    });

    return result;
  }, [conversations, search, filter, selectedTagIds, directoryMetaByPhoneKey]);

  const handleTagFilterClick = (e: React.MouseEvent<HTMLElement>) => {
    if (filter === 'tagged' && tags.length > 0) {
      setTagMenuAnchor(e.currentTarget);
    }
  };

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const runContextAction = useCallback((action: (conversation: WhatsAppConversation) => void) => {
    if (!contextMenu) return;
    action(contextMenu.conversation);
    closeContextMenu();
  }, [closeContextMenu, contextMenu]);

  const contextConversation = contextMenu?.conversation ?? null;
  const contextIsUnread = Boolean(
    contextConversation && (contextConversation.unreadCount > 0 || contextConversation.crmForceUnread),
  );

  const selectedIdList = useMemo(() => [...selectedIds], [selectedIds]);

  const selectedConversations = useMemo(
    () => conversations.filter((c) => selectedIds.has(c.id)),
    [conversations, selectedIds],
  );

  const allFilteredSelected = filtered.length > 0
    && filtered.every((c) => selectedIds.has(c.id));

  const allSelectedArchived = selectedConversations.length > 0
    && selectedConversations.every((c) => c.isArchived);

  const allSelectedPinned = selectedConversations.length > 0
    && selectedConversations.every((c) => c.isPinned);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkTagDialogOpen(false);
    setBulkTagSelection([]);
  }, []);

  const enterSelectionMode = useCallback((conversationId: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([conversationId]));
  }, []);

  const toggleSelectedId = useCallback((conversationId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      return next;
    });
  }, []);

  const handleSelectAllFiltered = useCallback(() => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filtered.map((c) => c.id)));
  }, [allFilteredSelected, filtered]);

  useEffect(() => {
    if (!selectionMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitSelectionMode();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectionMode, exitSelectionMode]);

  const runBulkAction = useCallback(async (action: () => Promise<void>) => {
    if (bulkLoading || selectedIdList.length === 0) return;
    setBulkLoading(true);
    try {
      await action();
      exitSelectionMode();
    } finally {
      setBulkLoading(false);
    }
  }, [bulkLoading, selectedIdList.length, exitSelectionMode]);

  const handleApplyBulkTags = useCallback(async () => {
    if (!onBulkAssignTags || bulkTagSelection.length === 0) return;
    await runBulkAction(() => onBulkAssignTags(selectedIdList, bulkTagSelection, bulkTagMode));
  }, [onBulkAssignTags, bulkTagSelection, bulkTagMode, runBulkAction, selectedIdList]);

  const openBulkTagDialog = useCallback(() => {
    setBulkTagMode('add');
    setBulkTagSelection([]);
    setBulkTagDialogOpen(true);
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.paper' }}>
      <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Buscar o iniciar chat"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: (t) =>
                  t.palette.mode === 'dark' ? alpha(t.palette.common.white, 0.06) : '#f0f2f5',
                borderRadius: 2,
                '& fieldset': { border: 'none' },
              },
            }}
          />
          {onNewContact && (
            <Tooltip title="Nuevo contacto">
              <IconButton size="small" onClick={onNewContact} sx={{ flexShrink: 0 }}>
                <PersonAddIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
          <Box
            sx={{
              width: '100%',
              maxWidth: '100%',
              overflowX: 'auto',
              overflowY: 'hidden',
              WebkitOverflowScrolling: 'touch',
              pb: 0.25,
              mx: -0.25,
              px: 0.25,
              '&::-webkit-scrollbar': { height: 6 },
              '&::-webkit-scrollbar-thumb': {
                borderRadius: 3,
                bgcolor: (t) => alpha(t.palette.text.secondary, 0.35),
              },
            }}
          >
            <ToggleButtonGroup
              value={filter}
              exclusive
              onChange={(_, val) => {
                if (val) {
                  setFilter(val);
                  if (val !== 'tagged') setSelectedTagIds([]);
                }
              }}
              size="small"
              sx={{
                flexWrap: 'nowrap',
                width: 'max-content',
                maxWidth: 'none',
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  px: { xs: 0.45, sm: 0.65 },
                  py: 0.45,
                },
              }}
            >
            <ToggleButton
              value="last24h"
              aria-label="Últimas 24 horas: actividad reciente en ventana móvil de 24 horas"
              title="Conversaciones con actividad en las últimas 24 horas (ventana móvil, no el día calendario). El número inferior es la cantidad de chats en ese período."
            >
              <InboxFilterTabLabel
                label="Últimas 24 horas"
                count={tabCounts.last24h}
                selected={filter === 'last24h'}
                icon={<AccessTimeIcon sx={{ fontSize: 16 }} />}
              />
            </ToggleButton>
            <ToggleButton value="all">
              <InboxFilterTabLabel label="Todos" count={tabCounts.all} selected={filter === 'all'} />
            </ToggleButton>
            <ToggleButton value="unread">
              <InboxFilterTabLabel
                label="No leídos"
                count={tabCounts.unread}
                selected={filter === 'unread'}
              />
            </ToggleButton>
            <ToggleButton value="tagged" onClick={handleTagFilterClick}>
              <InboxFilterTabLabel
                label="Tags"
                count={tabCounts.tagged}
                selected={filter === 'tagged'}
                icon={<LocalOfferIcon sx={{ fontSize: 16 }} />}
              />
            </ToggleButton>
            <ToggleButton value="archived">
              <InboxFilterTabLabel
                label="Archivados"
                count={tabCounts.archived}
                selected={filter === 'archived'}
                icon={<ArchiveIcon sx={{ fontSize: 16 }} />}
              />
            </ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {filter === 'tagged' && selectedTagIds.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center', maxWidth: '100%' }}>
              {selectedTagIds.map((tid) => (
                <Chip
                  key={tid}
                  label={tagMap.get(tid)?.name || tid}
                  size="small"
                  sx={{
                    bgcolor: tagMap.get(tid)?.color || '#1976d2',
                    color: '#fff',
                    height: 22,
                  }}
                  onDelete={() =>
                    setSelectedTagIds((prev) => prev.filter((x) => x !== tid))
                  }
                />
              ))}
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                {filtered.length} resultado{filtered.length === 1 ? '' : 's'}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {selectionMode && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            px: 1,
            py: 0.75,
            borderBottom: 1,
            borderColor: 'divider',
            bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
            flexWrap: 'wrap',
          }}
        >
          <Tooltip title="Salir de selección">
            <IconButton size="small" onClick={exitSelectionMode} disabled={bulkLoading}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 80, fontWeight: 600 }}>
            {selectedIds.size} seleccionado{selectedIds.size === 1 ? '' : 's'}
          </Typography>
          <Tooltip title={allFilteredSelected ? 'Deseleccionar todos' : 'Seleccionar todos (visibles)'}>
            <IconButton size="small" onClick={handleSelectAllFiltered} disabled={bulkLoading || filtered.length === 0}>
              <SelectAllIcon fontSize="small" color={allFilteredSelected ? 'primary' : 'inherit'} />
            </IconButton>
          </Tooltip>
          {onBulkAssignTags && (
            <Tooltip title="Asignar tags">
              <IconButton size="small" onClick={openBulkTagDialog} disabled={bulkLoading || selectedIds.size === 0}>
                <LocalOfferIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onBulkArchive && (
            <Tooltip title={allSelectedArchived ? 'Desarchivar' : 'Archivar'}>
              <IconButton
                size="small"
                disabled={bulkLoading || selectedIds.size === 0}
                onClick={() => runBulkAction(() => onBulkArchive(selectedIdList, !allSelectedArchived))}
              >
                {allSelectedArchived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          {onBulkMarkRead && (
            <>
              <Tooltip title="Marcar como leído">
                <IconButton
                  size="small"
                  disabled={bulkLoading || selectedIds.size === 0}
                  onClick={() => runBulkAction(() => onBulkMarkRead(selectedIdList, true))}
                >
                  <MarkChatReadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Marcar como no leído">
                <IconButton
                  size="small"
                  disabled={bulkLoading || selectedIds.size === 0}
                  onClick={() => runBulkAction(() => onBulkMarkRead(selectedIdList, false))}
                >
                  <MarkChatUnreadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
          {onBulkPin && (
            <Tooltip title={allSelectedPinned ? 'Desfijar' : 'Fijar arriba'}>
              <IconButton
                size="small"
                disabled={bulkLoading || selectedIds.size === 0}
                onClick={() => runBulkAction(() => onBulkPin(selectedIdList, !allSelectedPinned))}
              >
                {allSelectedPinned ? <PushPinOutlinedIcon fontSize="small" /> : <PushPinIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
          {onBulkDelete && (
            <Tooltip title="Eliminar conversaciones">
              <IconButton
                size="small"
                color="error"
                disabled={bulkLoading || selectedIds.size === 0}
                onClick={() => runBulkAction(() => onBulkDelete(selectedIdList))}
              >
                <DeleteForeverOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {bulkLoading && <CircularProgress size={18} sx={{ ml: 0.5 }} />}
        </Box>
      )}

      <Popover
        anchorEl={tagMenuAnchor}
        open={Boolean(tagMenuAnchor)}
        onClose={() => setTagMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        PaperProps={{
          sx: { minWidth: 260, maxHeight: 360 },
        }}
      >
        <List dense sx={{ py: 0 }}>
          <ListItemButton selected={selectedTagIds.length === 0} onClick={() => setSelectedTagIds([])}>
            <ListItemText primary="Todos los tags (cualquier etiqueta)" />
          </ListItemButton>
          {tags.map((tag) => {
            const checked = selectedTagIds.includes(tag.id);
            const cnt = tagCountsById[tag.id] ?? 0;
            return (
              <ListItemButton key={tag.id} onClick={() => toggleTagId(tag.id)}>
                <Checkbox
                  checked={checked}
                  tabIndex={-1}
                  disableRipple
                  sx={{ mr: 0.5, p: 0.25, pointerEvents: 'none' }}
                  size="small"
                />
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: tag.color || '#1976d2',
                    mr: 1,
                    flexShrink: 0,
                  }}
                />
                <ListItemText primary={tag.name} sx={{ flex: '1 1 auto', minWidth: 0 }} />
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, ml: 1 }}>
                  {cnt}
                </Typography>
              </ListItemButton>
            );
          })}
          {onManageTags && (
            <ListItemButton
              sx={{ borderTop: 1, borderColor: 'divider' }}
              onClick={() => {
                setTagMenuAnchor(null);
                onManageTags();
              }}
            >
              <Typography variant="body2" color="primary">
                Gestionar tags...
              </Typography>
            </ListItemButton>
          )}
        </List>
      </Popover>

      <Menu
        open={Boolean(contextMenu)}
        onClose={closeContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined
        }
      >
        <MenuItem
          onClick={() => {
            if (!contextMenu) return;
            enterSelectionMode(contextMenu.conversation.id);
            closeContextMenu();
          }}
        >
          <ListItemIcon><CheckBoxOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Seleccionar</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => runContextAction(onSelect)}>
          <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Abrir chat</ListItemText>
        </MenuItem>
        {onMarkReadToggle && (
          <MenuItem onClick={() => runContextAction(onMarkReadToggle)}>
            <ListItemIcon>
              {contextIsUnread ? <MarkChatReadIcon fontSize="small" /> : <MarkChatUnreadIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>{contextIsUnread ? 'Marcar como leído' : 'Marcar como no leído'}</ListItemText>
          </MenuItem>
        )}
        {onArchiveToggle && contextConversation && (
          <MenuItem onClick={() => runContextAction(onArchiveToggle)}>
            <ListItemIcon>
              {contextConversation.isArchived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>{contextConversation.isArchived ? 'Desarchivar' : 'Archivar'}</ListItemText>
          </MenuItem>
        )}
        {onPinToggle && contextConversation && (
          <MenuItem onClick={() => runContextAction(onPinToggle)}>
            <ListItemIcon>
              {contextConversation.isPinned ? <PushPinOutlinedIcon fontSize="small" /> : <PushPinIcon fontSize="small" />}
            </ListItemIcon>
            <ListItemText>{contextConversation.isPinned ? 'Desfijar' : 'Fijar arriba'}</ListItemText>
          </MenuItem>
        )}
        {onAssignTags && (
          <MenuItem
            onClick={(event) => {
              setAssignTagsAnchor(event.currentTarget);
            }}
          >
            <ListItemIcon><LocalOfferIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Asignar tags</ListItemText>
          </MenuItem>
        )}
        {onDeleteConversation && (
          <MenuItem onClick={() => runContextAction(onDeleteConversation)}>
            <ListItemIcon><DeleteForeverOutlinedIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>Eliminar conversación</ListItemText>
          </MenuItem>
        )}
        {onBlockConversation && (
          <MenuItem onClick={() => runContextAction(onBlockConversation)}>
            <ListItemIcon><BlockIcon fontSize="small" color="error" /></ListItemIcon>
            <ListItemText>Marcar como spam / bloquear</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <Popover
        anchorEl={assignTagsAnchor}
        open={Boolean(assignTagsAnchor && contextConversation)}
        onClose={() => {
          setAssignTagsAnchor(null);
          closeContextMenu();
        }}
        anchorOrigin={{ vertical: 'center', horizontal: 'right' }}
        transformOrigin={{ vertical: 'center', horizontal: 'left' }}
        PaperProps={{ sx: { minWidth: 240, maxHeight: 360 } }}
      >
        <List dense sx={{ py: 0 }}>
          {tags.length === 0 ? (
            <ListItemButton
              onClick={() => {
                setAssignTagsAnchor(null);
                closeContextMenu();
                onManageTags?.();
              }}
            >
              <ListItemText primary="Crear tags" secondary="No hay tags disponibles" />
            </ListItemButton>
          ) : (
            tags.map((tag) => {
              const checked = Boolean(contextConversation?.tagIds?.includes(tag.id));
              return (
                <ListItemButton
                  key={tag.id}
                  onClick={() => {
                    if (!contextConversation || !onAssignTags) return;
                    const current = contextConversation.tagIds || [];
                    const next = checked
                      ? current.filter((id) => id !== tag.id)
                      : [...current, tag.id];
                    onAssignTags(contextConversation, next);
                    setContextMenu((prev) =>
                      prev && prev.conversation.id === contextConversation.id
                        ? { ...prev, conversation: { ...prev.conversation, tagIds: next } }
                        : prev,
                    );
                  }}
                >
                  <Checkbox
                    checked={checked}
                    tabIndex={-1}
                    disableRipple
                    sx={{ mr: 0.5, p: 0.25, pointerEvents: 'none' }}
                    size="small"
                  />
                  <Box
                    sx={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      bgcolor: tag.color || '#1976d2',
                      mr: 1,
                      flexShrink: 0,
                    }}
                  />
                  <ListItemText primary={tag.name} />
                </ListItemButton>
              );
            })
          )}
        </List>
      </Popover>

      <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
        {filtered.map((conv) => {
          const dirMeta = getDirectoryMetaForConversation(conv, directoryMetaByPhoneKey);
          const rowPhone = conv.contactPhone || conv.phone;
          const rowName = resolveContactDisplayName({
            directoryDisplayName: dirMeta?.displayName,
            contactName: conv.contactName,
            whatsappProfileName: conv.whatsappProfileName,
            phone: rowPhone,
            conversationId: conv.id,
          });
          const rowPhoto = pickContactPhotoUrl(dirMeta?.photoUrl, conv.contactPhotoUrl);
          const convTags = (conv.tagIds || []).map((id) => tagMap.get(id)).filter(Boolean) as WhatsAppTag[];
          const isUnread = conv.unreadCount > 0 || conv.crmForceUnread;
          const peers = presenceByConversationId?.[conv.id] || [];
          const peerSummary = summarizePeerPresences(peers);

          return (
            <ListItemButton
              key={conv.id}
              selected={conv.id === selectedId}
              onClick={() => onSelect(conv)}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu(
                  contextMenu === null
                    ? {
                        mouseX: event.clientX + 2,
                        mouseY: event.clientY - 6,
                        conversation: conv,
                      }
                    : null,
                );
              }}
              sx={{
                py: 1.5,
                px: 2,
                borderBottom: 1,
                borderColor: 'divider',
                '&.Mui-selected': { bgcolor: 'action.selected' },
              }}
            >
              <ListItemAvatar>
                <Badge
                  badgeContent={conv.crmForceUnread && conv.unreadCount === 0 ? ' ' : conv.unreadCount}
                  color="success"
                  max={99}
                  invisible={!isUnread}
                  variant={conv.crmForceUnread && conv.unreadCount === 0 ? 'dot' : 'standard'}
                >
                  <ContactAvatar
                    displayName={rowName}
                    phone={rowPhone}
                    photoUrl={rowPhoto}
                    size={48}
                  />
                </Badge>
              </ListItemAvatar>
              <ListItemText
                primaryTypographyProps={{ component: 'div' }}
                secondaryTypographyProps={{ component: 'div' }}
                primary={
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flex: 1 }}>
                      {conv.isPinned && <PushPinIcon sx={{ fontSize: 14, color: 'text.secondary', transform: 'rotate(45deg)' }} />}
                      <Typography variant="body1" fontWeight={isUnread ? 600 : 400} noWrap>
                        {rowName}
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{ color: isUnread ? 'success.main' : 'text.secondary', whiteSpace: 'nowrap', ml: 1 }}
                    >
                      {formatRelativeTime(conv.lastMessageAt)}
                    </Typography>
                  </Box>
                }
                secondary={
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 0.5 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        {conv.lastMessageDirection === 'outbound' && (
                          <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                            <OutboundPreviewTicks status={conv.lastMessageOutboundStatus} />
                          </Box>
                        )}
                        <Typography
                          variant="body2"
                          noWrap
                          sx={{
                            color: 'text.secondary',
                            fontWeight: conv.unreadCount > 0 ? 500 : 400,
                            minWidth: 0,
                          }}
                        >
                          {conv.lastMessageText || 'Sin mensajes'}
                        </Typography>
                      </Box>
                      {conv.isPinned && (
                        <PushPinIcon sx={{ fontSize: 14, color: 'text.secondary', ml: 0.5, flexShrink: 0, transform: 'rotate(45deg)' }} />
                      )}
                    </Box>
                    {convTags.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                        {convTags.slice(0, 3).map((tag) => (
                          <Chip
                            key={tag.id}
                            label={tag.name}
                            size="small"
                            sx={{
                              height: 18,
                              fontSize: '0.65rem',
                              bgcolor: tag.color || '#1976d2',
                              color: '#fff',
                            }}
                          />
                        ))}
                        {convTags.length > 3 && (
                          <Typography variant="caption" color="text.secondary">
                            +{convTags.length - 3}
                          </Typography>
                        )}
                      </Box>
                    )}
                    {peerSummary && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          mt: 0.5,
                          color: peerSummary.typing ? 'success.main' : 'info.main',
                        }}
                      >
                        {peerSummary.typing ? (
                          <EditIcon sx={{ fontSize: 12 }} />
                        ) : (
                          <VisibilityIcon sx={{ fontSize: 12 }} />
                        )}
                        <Typography
                          variant="caption"
                          sx={{ fontWeight: 500, lineHeight: 1.2 }}
                          noWrap
                        >
                          {peerSummary.text}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                }
              />
            </ListItemButton>
          );
        })}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {filtered.length === 0 && !loading && (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">No hay conversaciones</Typography>
          </Box>
        )}
      </List>
    </Box>
  );
};

export default ConversationList;
