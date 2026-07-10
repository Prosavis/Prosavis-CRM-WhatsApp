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
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
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
import CloseIcon from '@mui/icons-material/Close';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import SelectAllIcon from '@mui/icons-material/SelectAll';
import FilterListIcon from '@mui/icons-material/FilterList';
import type {
  WhatsAppConversation,
  WhatsAppTag,
  WhatsAppAdminPresence,
} from '@/services/whatsappService';
import { summarizePeerPresences } from '@/utils/whatsappAdminPresence';
import OutboundPreviewTicks from './OutboundPreviewTicks';
import InboxCategorySidebar from './InboxCategorySidebar';
import { ContactAvatar } from '@/components/common/ContactAvatar';
import {
  getDirectoryMetaForConversation,
  useDirectoryContactMeta,
} from '@/hooks/useDirectoryContactMeta';
import { pickContactPhotoUrl } from '@/utils/contactAvatar';
import { resolveContactDisplayName } from '@/utils/contactDisplayName';
import {
  conversationMatchesInboxCategory,
  conversationMatchesSelectedTags,
  getSecondaryFilterTags,
  getTabCountForCategory,
  type WhatsAppTabCounts,
} from '@/utils/whatsappInboxStats';
import {
  getInboxCategoryDefinition,
  INBOX_FILTER_STORAGE_KEY,
  INBOX_SIDEBAR_COLLAPSED_KEY,
  VALID_INBOX_CATEGORIES,
  type InboxCategoryId,
  type InboxTagCategoryId,
} from '@/constants/inboxCategories';
import { useLongPress } from '@/hooks/useLongPress';
import { coloredChipSx } from '@/utils/coloredChipStyles';

export type BulkTagMode = 'add' | 'replace';

function countConversationsMatchingTags(
  conversations: WhatsAppConversation[],
  selectedTagIds: string[],
  archived: boolean,
): number {
  if (selectedTagIds.length === 0) return 0;
  return conversations.filter(
    (c) => !!c.isArchived === archived && conversationMatchesSelectedTags(c, selectedTagIds),
  ).length;
}

function readStoredInboxFilter(): InboxCategoryId {
  try {
    const stored = sessionStorage.getItem(INBOX_FILTER_STORAGE_KEY);
    if (stored && (VALID_INBOX_CATEGORIES as readonly string[]).includes(stored)) {
      return stored as InboxCategoryId;
    }
    // Migración: pestaña antigua "tagged" → Todos
    if (stored === 'tagged') return 'all';
  } catch {
    // sessionStorage puede estar bloqueado
  }
  return 'last24h';
}

function readStoredSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(INBOX_SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

interface ConversationListProps {
  conversations: WhatsAppConversation[];
  tabCounts: WhatsAppTabCounts;
  tagCountsById: Record<string, number>;
  archivedTagCountsById: Record<string, number>;
  categoryTagIds: Record<InboxTagCategoryId, string[]>;
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
  onConfigureOutOfCoverage?: () => void;
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

interface ConversationRowProps {
  conv: WhatsAppConversation;
  rowName: string;
  rowPhone: string | undefined;
  rowPhoto: string | undefined;
  convTags: WhatsAppTag[];
  isUnread: boolean;
  peerSummary: ReturnType<typeof summarizePeerPresences> | null;
  selectionMode: boolean;
  bulkSelected: boolean;
  chatSelected: boolean;
  onOpenChat: () => void;
  onEnterSelection: () => void;
  onToggleBulkSelect: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

const ConversationRow: React.FC<ConversationRowProps> = ({
  conv,
  rowName,
  rowPhone,
  rowPhoto,
  convTags,
  isUnread,
  peerSummary,
  selectionMode,
  bulkSelected,
  chatSelected,
  onOpenChat,
  onEnterSelection,
  onToggleBulkSelect,
  onContextMenu,
}) => {
  const theme = useTheme();
  const longPress = useLongPress({ onLongPress: onEnterSelection });

  const handleClick = () => {
    if (longPress.shouldSuppressClick()) return;
    if (selectionMode) {
      onToggleBulkSelect();
      return;
    }
    onOpenChat();
  };

  return (
    <ListItemButton
      selected={selectionMode ? bulkSelected : chatSelected}
      onClick={handleClick}
      onContextMenu={selectionMode ? undefined : onContextMenu}
      onPointerDown={selectionMode ? undefined : longPress.onPointerDown}
      onPointerUp={selectionMode ? undefined : longPress.onPointerUp}
      onPointerLeave={selectionMode ? undefined : longPress.onPointerLeave}
      onPointerCancel={selectionMode ? undefined : longPress.onPointerCancel}
      sx={{
        py: 1.5,
        px: 2,
        borderBottom: 1,
        borderColor: 'divider',
        touchAction: 'manipulation',
        '&.Mui-selected': { bgcolor: 'action.selected' },
      }}
    >
      {selectionMode && (
        <Checkbox
          checked={bulkSelected}
          tabIndex={-1}
          disableRipple
          inputProps={{ 'aria-label': `Seleccionar ${rowName}` }}
          sx={{ mr: 1, p: 0.25, pointerEvents: 'none' }}
          size="small"
        />
      )}
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, flex: 1 }}>
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
                    sx={coloredChipSx(theme, tag.color, 'filled', { height: 18, fontSize: '0.65rem' })}
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
                <Typography variant="caption" sx={{ fontWeight: 500, lineHeight: 1.2 }} noWrap>
                  {peerSummary.text}
                </Typography>
              </Box>
            )}
          </Box>
        }
      />
    </ListItemButton>
  );
};

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  tabCounts,
  tagCountsById,
  archivedTagCountsById,
  categoryTagIds,
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
  onConfigureOutOfCoverage,
}) => {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InboxCategoryId>(readStoredInboxFilter);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readStoredSidebarCollapsed);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkTagDialogOpen, setBulkTagDialogOpen] = useState(false);
  const [bulkTagMode, setBulkTagMode] = useState<BulkTagMode>('add');
  const [bulkTagSelection, setBulkTagSelection] = useState<string[]>([]);
  const [tagMenuAnchor, setTagMenuAnchor] = useState<null | HTMLElement>(null);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    conversation: WhatsAppConversation;
  } | null>(null);
  const [assignTagsAnchor, setAssignTagsAnchor] = useState<null | HTMLElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(INBOX_FILTER_STORAGE_KEY, filter);
    } catch {
      // sessionStorage puede estar bloqueado
    }
  }, [filter]);

  useEffect(() => {
    try {
      localStorage.setItem(INBOX_SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      // localStorage puede estar bloqueado
    }
  }, [sidebarCollapsed]);

  const directoryMetaByPhoneKey = useDirectoryContactMeta(conversations);

  const tagMap = useMemo(() => {
    const map = new Map<string, WhatsAppTag>();
    tags.forEach((t) => map.set(t.id, t));
    return map;
  }, [tags]);

  const secondaryTags = useMemo(
    () => getSecondaryFilterTags(tags, categoryTagIds) as WhatsAppTag[],
    [tags, categoryTagIds],
  );

  const categoryDef = getInboxCategoryDefinition(filter);
  const categoryCount = getTabCountForCategory(tabCounts, filter);

  const toggleTagId = useCallback((id: string) => {
    setSelectedTagIds((prev) => {
      const i = prev.indexOf(id);
      if (i === -1) return [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }, []);

  const handleCategoryChange = useCallback((next: InboxCategoryId) => {
    setFilter(next);
  }, []);

  const filtered = useMemo(() => {
    let result = conversations.filter((c) =>
      conversationMatchesInboxCategory(c, filter, categoryTagIds),
    );

    if (selectedTagIds.length > 0) {
      result = result.filter((c) => conversationMatchesSelectedTags(c, selectedTagIds));
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
  }, [conversations, search, filter, selectedTagIds, directoryMetaByPhoneKey, categoryTagIds]);

  const archivedMatchingSelectedTags = useMemo(
    () => countConversationsMatchingTags(conversations, selectedTagIds, true),
    [conversations, selectedTagIds],
  );

  const showSelectedTagChips = selectedTagIds.length > 0;

  const showArchivedTagHint =
    filter !== 'archived'
    && selectedTagIds.length > 0
    && !loading
    && filtered.length === 0
    && archivedMatchingSelectedTags > 0;

  const handleViewArchivedWithTags = useCallback(() => {
    setFilter('archived');
  }, []);

  const handleTagFilterClick = (e: React.MouseEvent<HTMLElement>) => {
    if (secondaryTags.length > 0 || onManageTags) {
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
    <Box sx={{ display: 'flex', height: '100%', bgcolor: 'background.paper', minHeight: 0 }}>
      <InboxCategorySidebar
        category={filter}
        onCategoryChange={handleCategoryChange}
        tabCounts={tabCounts}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
        onConfigureOutOfCoverage={onConfigureOutOfCoverage}
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
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
          <Tooltip title="Filtrar por tags">
            <IconButton
              size="small"
              onClick={handleTagFilterClick}
              color={selectedTagIds.length > 0 ? 'primary' : 'default'}
              sx={{ flexShrink: 0 }}
              aria-label="Filtrar por tags"
            >
              <Badge
                color="primary"
                badgeContent={selectedTagIds.length || undefined}
                overlap="circular"
              >
                <FilterListIcon />
              </Badge>
            </IconButton>
          </Tooltip>
          {onNewContact && (
            <Tooltip title="Nuevo contacto">
              <IconButton size="small" onClick={onNewContact} sx={{ flexShrink: 0 }}>
                <PersonAddIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: showSelectedTagChips ? 0.75 : 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
            {categoryDef.label}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {filtered.length === categoryCount
              ? `${categoryCount}`
              : `${filtered.length} de ${categoryCount}`}
          </Typography>
          {selectedTagIds.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              · filtrado por tags
            </Typography>
          )}
        </Box>

        {showSelectedTagChips && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
            {selectedTagIds.map((tid) => (
              <Chip
                key={tid}
                label={tagMap.get(tid)?.name || tid}
                size="small"
                sx={{
                  height: 22,
                  ...coloredChipSx(theme, tagMap.get(tid)?.color, 'filled'),
                }}
                onDelete={() =>
                  setSelectedTagIds((prev) => prev.filter((x) => x !== tid))
                }
              />
            ))}
            <Button
              size="small"
              onClick={() => setSelectedTagIds([])}
              sx={{ textTransform: 'none', minWidth: 0, px: 0.75 }}
            >
              Limpiar
            </Button>
          </Box>
        )}
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
            <ListItemText
              primary="Sin filtro de tags"
              secondary="Mostrar todos los chats de esta categoría"
            />
          </ListItemButton>
          {secondaryTags.length === 0 ? (
            <ListItemButton disabled>
              <ListItemText
                primary="No hay tags adicionales"
                secondary="Los tags de categoría (Agendado, etc.) se eligen en la barra izquierda"
              />
            </ListItemButton>
          ) : (
            secondaryTags.map((tag) => {
              const checked = selectedTagIds.includes(tag.id);
              const cnt = filter === 'archived'
                ? (archivedTagCountsById[tag.id] ?? 0)
                : (tagCountsById[tag.id] ?? 0);
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
            })
          )}
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

      <Dialog
        open={bulkTagDialogOpen}
        onClose={() => !bulkLoading && setBulkTagDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Tags para {selectedIds.size} chat{selectedIds.size === 1 ? '' : 's'}</DialogTitle>
        <DialogContent dividers>
          <ToggleButtonGroup
            value={bulkTagMode}
            exclusive
            fullWidth
            size="small"
            onChange={(_, val: BulkTagMode | null) => {
              if (val) setBulkTagMode(val);
            }}
            sx={{ mb: 2 }}
          >
            <ToggleButton value="add">Agregar tags</ToggleButton>
            <ToggleButton value="replace">Reemplazar tags</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            {bulkTagMode === 'add'
              ? 'Los tags elegidos se añadirán a los existentes en cada chat.'
              : 'Todos los chats quedarán solo con los tags elegidos.'}
          </Typography>
          <List dense sx={{ py: 0 }}>
            {tags.length === 0 ? (
              <ListItemButton
                onClick={() => {
                  setBulkTagDialogOpen(false);
                  onManageTags?.();
                }}
              >
                <ListItemText primary="Crear tags" secondary="No hay tags disponibles" />
              </ListItemButton>
            ) : (
              tags.map((tag) => {
                const checked = bulkTagSelection.includes(tag.id);
                return (
                  <ListItemButton
                    key={tag.id}
                    onClick={() => {
                      setBulkTagSelection((prev) =>
                        checked ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkTagDialogOpen(false)} disabled={bulkLoading}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            disabled={bulkLoading || bulkTagSelection.length === 0}
            onClick={() => void handleApplyBulkTags()}
          >
            Aplicar
          </Button>
        </DialogActions>
      </Dialog>

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
          const isUnread = Boolean(conv.unreadCount > 0 || conv.crmForceUnread);
          const peers = presenceByConversationId?.[conv.id] || [];
          const peerSummary = summarizePeerPresences(peers);

          return (
            <ConversationRow
              key={conv.id}
              conv={conv}
              rowName={rowName}
              rowPhone={rowPhone}
              rowPhoto={rowPhoto}
              convTags={convTags}
              isUnread={isUnread}
              peerSummary={peerSummary}
              selectionMode={selectionMode}
              bulkSelected={selectedIds.has(conv.id)}
              chatSelected={conv.id === selectedId}
              onOpenChat={() => onSelect(conv)}
              onEnterSelection={() => enterSelectionMode(conv.id)}
              onToggleBulkSelect={() => toggleSelectedId(conv.id)}
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
            />
          );
        })}

        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {filtered.length === 0 && !loading && (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            {showArchivedTagHint ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="body2" color="text.secondary">
                  No hay conversaciones en esta categoría con este tag.
                  {' '}
                  {archivedMatchingSelectedTags}
                  {' '}
                  archivada{archivedMatchingSelectedTags === 1 ? '' : 's'}
                  {selectedTagIds.length === 1 ? (
                    <>
                      {' '}
                      con «{tagMap.get(selectedTagIds[0])?.name || 'tag'}».
                    </>
                  ) : (
                    '.'
                  )}
                </Typography>
                <Button variant="outlined" size="small" onClick={handleViewArchivedWithTags}>
                  Ver archivadas
                </Button>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">No hay conversaciones</Typography>
            )}
          </Box>
        )}
      </List>
      </Box>
    </Box>
  );
};

export default ConversationList;
