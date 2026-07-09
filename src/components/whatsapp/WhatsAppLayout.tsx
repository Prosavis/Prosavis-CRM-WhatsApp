import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Box, Snackbar, Alert, Button } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ConversationList from './ConversationList';
import ChatArea from './ChatArea';
import WhatsAppEmptyState from './WhatsAppEmptyState';
import TemplatesSidePanel from './TemplatesSidePanel';
import WhatsAppContactSidePanel from './WhatsAppContactSidePanel';
import { useWhatsAppContactContext } from '@/hooks/useWhatsAppContactContext';
import { useAuth } from '@/hooks/useAuth';
import {
  subscribeToConversations,
  refetchConversations,
  subscribeToWhatsAppAdminPresence,
  clearMyWhatsAppPresence,
  PRESENCE_TTL_MS,
  listWhatsAppTags,
  listWhatsAppSnippets,
  assignWhatsAppTags,
  blockWhatsAppUser,
  deleteWhatsAppConversationPermanently,
  markAsRead,
  patchWhatsAppConversationAdmin,
  getInboxCategorySettings,
  DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE,
  type WhatsAppConversation,
  type WhatsAppTag,
  type WhatsAppSnippet,
  type WhatsAppAdminPresence,
} from '@/services/whatsappService';
import TagManagerDialog from './TagManagerDialog';
import NewContactDialog from './NewContactDialog';
import OutOfCoverageTagsDialog from './OutOfCoverageTagsDialog';
import {
  computeWhatsAppInboxMetrics,
  type CategoryTagIdOverrides,
  type WhatsAppInboxMetrics,
} from '@/utils/whatsappInboxStats';
import { clearAllComposerDrafts } from '@/utils/messageComposerDraftStore';
import { areSoundsEnabled, getSoundVolume } from '@/utils/soundPreferences';
import {
  canShowDesktopNotifications,
  showInboundMessageNotification,
} from '@/utils/desktopNotifications';
import useSoundEffects from '@/hooks/useSoundEffects';

const INBOUND_NOTIFY_AUDIO = `${import.meta.env.BASE_URL}assets/audio/WhatsAppSound.mp3`;

function resolveAdminDisplayName(
  adminName: string | undefined,
  authDisplayName: string | undefined | null,
  email: string | undefined | null,
): string {
  if (adminName && adminName.trim()) return adminName.trim();
  if (authDisplayName && authDisplayName.trim()) return authDisplayName.trim();
  if (email) {
    const local = email.split('@')[0];
    if (local) return local;
  }
  return 'Administrador';
}

import { resolveContactDisplayName } from '@/utils/contactDisplayName';

function conversationShortLabel(c: WhatsAppConversation): string {
  return resolveContactDisplayName({
    contactName: c.contactName,
    whatsappProfileName: c.whatsappProfileName,
    phone: c.contactPhone ?? c.phone,
    conversationId: c.id,
  });
}

type RightPanelMode = 'none' | 'templates' | 'contact';

async function runBulk(
  ids: string[],
  fn: (id: string) => Promise<unknown>,
): Promise<{ ok: number; fail: number }> {
  const results = await Promise.allSettled(ids.map((id) => fn(id)));
  let ok = 0;
  let fail = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') ok += 1;
    else fail += 1;
  }
  return { ok, fail };
}

function notifyBulkResult(
  notify: (message: string, severity: 'success' | 'error') => void,
  label: string,
  { ok, fail }: { ok: number; fail: number },
) {
  if (fail === 0) {
    notify(`${ok} chat${ok === 1 ? '' : 's'} ${label}`, 'success');
  } else if (ok === 0) {
    notify(`No se pudo completar la acción en ${fail} chat${fail === 1 ? '' : 's'}`, 'error');
  } else {
    notify(`${ok} ok, ${fail} fallaron`, 'error');
  }
}

function conversationMatchesFocusPhone(
  focusPhone: string | undefined,
  c: WhatsAppConversation,
): boolean {
  if (!focusPhone) return false;
  if (c.phone === focusPhone || c.contactPhone === focusPhone) return true;
  const fd = focusPhone.replace(/\D/g, '');
  if (!fd) return false;
  const p1 = (c.phone ?? '').replace(/\D/g, '');
  const p2 = (c.contactPhone ?? '').replace(/\D/g, '');
  return fd === p1 || fd === p2;
}

interface WhatsAppLayoutProps {
  phoneNumberId?: string;
  wabaId?: string;
  focusPhone?: string;
  /** Llamar al cerrar el chat que coincidía con `focusPhone` (p. ej. quitar el query de la URL). */
  onClearFocusPhone?: () => void;
  focusConversation?: string;
  /** Llamar al cerrar el chat que coincidía con `focusConversation` (p. ej. quitar el query de la URL). */
  onClearFocusConversation?: () => void;
  /** Métricas del inbox (contactos totales, tabs, tags) para cabeceras externas o analítica. */
  onInboxMetrics?: (metrics: WhatsAppInboxMetrics) => void;
}

const WhatsAppLayout: React.FC<WhatsAppLayoutProps> = ({
  phoneNumberId,
  wabaId,
  focusPhone,
  onClearFocusPhone,
  focusConversation,
  onClearFocusConversation,
  onInboxMetrics,
}) => {
  const theme = useTheme();
  const { user, profile, session, loading: authLoading } = useAuth();
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<WhatsAppConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [subscriptionKey, setSubscriptionKey] = useState(0);
  const [rightPanel, setRightPanel] = useState<RightPanelMode>('none');
  const [composerDraft, setComposerDraft] = useState('');
  const [tags, setTags] = useState<WhatsAppTag[]>([]);
  const [snippets, setSnippets] = useState<WhatsAppSnippet[]>([]);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [outOfCoverageDialogOpen, setOutOfCoverageDialogOpen] = useState(false);
  const [categoryTagOverrides, setCategoryTagOverrides] = useState<CategoryTagIdOverrides>({});

  const [inboundAlert, setInboundAlert] = useState<{ message: string; conversationId: string } | null>(null);
  const [inboundPulse, setInboundPulse] = useState(false);
  const [actionSnack, setActionSnack] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

  const { playSuccess, playError } = useSoundEffects();

  const notifyAction = useCallback((message: string, severity: 'success' | 'error') => {
    setActionSnack({ open: true, message, severity });
    if (severity === 'success') {
      toast.success(message);
      playSuccess();
    } else {
      toast.error(message);
      playError();
    }
  }, [playSuccess, playError]);

  const notifyAudioRef = useRef<HTMLAudioElement | null>(null);
  const inboundBaselineReadyRef = useRef(false);
  const inboundPrevSnapshotRef = useRef<Map<string, { at: number }>>(new Map());

  // Presencia entre admins (otras pestañas / otros usuarios viendo el inbox).
  const [presenceEntries, setPresenceEntries] = useState<WhatsAppAdminPresence[]>([]);
  const [presenceTick, setPresenceTick] = useState(0);

  const myUid = user?.id ?? null;
  const myDisplayName = useMemo(
    () => resolveAdminDisplayName(profile?.displayName, profile?.displayName, user?.email),
    [profile?.displayName, user?.email],
  );

  const contactCtx = useWhatsAppContactContext(selectedConversation);

  const inboxMetrics = useMemo(
    () => computeWhatsAppInboxMetrics(conversations, tags, categoryTagOverrides),
    [conversations, tags, categoryTagOverrides],
  );

  useEffect(() => {
    onInboxMetrics?.(inboxMetrics);
  }, [inboxMetrics, onInboxMetrics]);

  useEffect(() => {
    const audio = new Audio(INBOUND_NOTIFY_AUDIO);
    audio.volume = getSoundVolume();
    notifyAudioRef.current = audio;
  }, []);

  useEffect(() => {
    inboundBaselineReadyRef.current = false;
    inboundPrevSnapshotRef.current = new Map();
    clearAllComposerDrafts();
    setSelectedConversation(null);
  }, [phoneNumberId]);

  const handleRetryInbox = useCallback(() => {
    setSubscriptionKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (authLoading || !session?.access_token) {
      return;
    }

    setLoading(true);
    setInboxError(null);

    const unsub = subscribeToConversations(
      (convs) => {
        setConversations(convs);
        setLoading(false);
        setInboxError(null);
      },
      phoneNumberId,
      (error) => {
        console.error('Error en listener de conversaciones:', error);
        setInboxError(error.message || 'No se pudieron cargar las conversaciones');
        setLoading(false);
      },
    );

    return () => unsub();
  }, [phoneNumberId, session?.access_token, authLoading, subscriptionKey]);

  useEffect(() => {
    if (authLoading || !session?.access_token) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      void refetchConversations(phoneNumberId)
        .then((convs) => {
          setConversations(convs);
          setInboxError(null);
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'No se pudieron recargar las conversaciones';
          setInboxError(message);
        });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [phoneNumberId, session?.access_token, authLoading]);

  const loadTags = useCallback(async () => {
    try {
      const result = await listWhatsAppTags();
      setTags(result);
    } catch (err) {
      console.error('Error loading tags:', err);
    }
  }, []);

  const loadCategorySettings = useCallback(async () => {
    try {
      const settings = await getInboxCategorySettings('fuera_cobertura');
      if (settings) {
        setCategoryTagOverrides({ fuera_cobertura: settings.tagIds });
      }
    } catch (err) {
      console.error('Error loading inbox category settings:', err);
    }
  }, []);

  const loadSnippets = useCallback(async () => {
    try {
      const result = await listWhatsAppSnippets();
      setSnippets(result);
    } catch (err) {
      console.error('Error loading snippets:', err);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  useEffect(() => {
    void loadCategorySettings();
  }, [loadCategorySettings]);

  useEffect(() => {
    void loadSnippets();
  }, [loadSnippets]);

  useEffect(() => {
    if (loading) return;

    const nextMap = new Map<string, { at: number }>();
    for (const c of conversations) {
      nextMap.set(c.id, { at: c.lastMessageAt?.getTime() ?? 0 });
    }

    if (!inboundBaselineReadyRef.current) {
      inboundBaselineReadyRef.current = true;
      inboundPrevSnapshotRef.current = nextMap;
      return;
    }

    const candidates: WhatsAppConversation[] = [];
    const now = Date.now();
    const newConvMaxAgeMs = 120_000;

    for (const c of conversations) {
      if (c.lastMessageDirection !== 'inbound') continue;
      const at = c.lastMessageAt?.getTime() ?? 0;
      if (at === 0) continue;
      const prev = inboundPrevSnapshotRef.current.get(c.id);
      if (!prev) {
        const age = now - at;
        if (age >= 0 && age < newConvMaxAgeMs) candidates.push(c);
      } else if (at > prev.at) {
        candidates.push(c);
      }
    }

    inboundPrevSnapshotRef.current = nextMap;

    if (candidates.length === 0) return;

    const best = candidates.reduce((a, b) => {
      const ta = a.lastMessageAt?.getTime() ?? 0;
      const tb = b.lastMessageAt?.getTime() ?? 0;
      return ta >= tb ? a : b;
    });

    const contactLabel = conversationShortLabel(best);
    const focusPhone = best.contactPhone || best.phone || '';

    if (areSoundsEnabled()) {
      const audio = notifyAudioRef.current;
      if (audio) {
        audio.volume = getSoundVolume();
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
    }

    if (document.hidden && canShowDesktopNotifications()) {
      showInboundMessageNotification({
        title: 'Nuevo mensaje de WhatsApp',
        body: contactLabel,
        conversationId: best.id,
        phone: focusPhone,
      });
    }

    if (!document.hidden) {
      setInboundAlert({
        message: `Nuevo mensaje en ${contactLabel}`,
        conversationId: best.id,
      });
    }
    setInboundPulse(true);
    window.setTimeout(() => setInboundPulse(false), 1400);
  }, [conversations, loading]);

  useEffect(() => {
    if (selectedConversation) {
      const updated = conversations.find((c) => c.id === selectedConversation.id);
      if (updated) setSelectedConversation(updated);
    }
  }, [conversations, selectedConversation]);

  useEffect(() => {
    if (!phoneNumberId || !myUid) {
      setPresenceEntries([]);
      return;
    }
    const unsub = subscribeToWhatsAppAdminPresence(
      phoneNumberId,
      (entries) => setPresenceEntries(entries),
      (err) => console.error('Error en listener de presencia WhatsApp:', err),
    );
    return () => unsub();
  }, [phoneNumberId, myUid]);

  useEffect(() => {
    const id = window.setInterval(() => setPresenceTick((t) => t + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!myUid) return;
    return () => {
      void clearMyWhatsAppPresence(myUid);
    };
  }, [myUid]);

  const livePeerPresences = useMemo(() => {
    const now = Date.now();
    return presenceEntries.filter((p) => {
      if (!p.uid || p.uid === myUid) return false;
      if (!p.updatedAt) return false;
      if (now - p.updatedAt.getTime() > PRESENCE_TTL_MS) return false;
      if (p.activity === 'none' || !p.conversationId) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenceEntries, myUid, presenceTick]);

  const presenceByConversationId = useMemo(() => {
    const map: Record<string, WhatsAppAdminPresence[]> = {};
    for (const p of livePeerPresences) {
      const cid = p.conversationId;
      if (!cid) continue;
      if (!map[cid]) map[cid] = [];
      map[cid].push(p);
    }
    return map;
  }, [livePeerPresences]);

  const peersInSelectedChat = useMemo(() => {
    if (!selectedConversation) return [];
    return livePeerPresences.filter((p) => p.conversationId === selectedConversation.id);
  }, [livePeerPresences, selectedConversation]);

  useEffect(() => {
    if (focusPhone && conversations.length > 0) {
      const match = conversations.find(
        (c) => c.phone === focusPhone || c.contactPhone === focusPhone,
      );
      if (match) {
        setSelectedConversation(match);
      }
    }
  }, [focusPhone, conversations]);

  useEffect(() => {
    if (focusConversation && conversations.length > 0) {
      const match = conversations.find((c) => c.id === focusConversation);
      if (match) {
        setSelectedConversation(match);
      }
    }
  }, [focusConversation, conversations]);

  const recipientPhoneForTemplates = selectedConversation
    ? selectedConversation.contactPhone || selectedConversation.phone || ''
    : '';
  const templateRecipientDigits = recipientPhoneForTemplates.replace(/\D/g, '');
  const canShowTemplates =
    Boolean(selectedConversation && wabaId && phoneNumberId) &&
    templateRecipientDigits.length >= 10;

  useEffect(() => {
    if (!selectedConversation) {
      setRightPanel('none');
    }
  }, [selectedConversation]);

  useEffect(() => {
    if (!canShowTemplates) {
      setRightPanel((prev) => (prev === 'templates' ? 'none' : prev));
    }
  }, [canShowTemplates]);

  const handleContactCreated = useCallback((conversationId: string) => {
    setNewContactOpen(false);
    const match = conversations.find((c) => c.id === conversationId);
    if (match) setSelectedConversation(match);
  }, [conversations]);

  const handleToggleContactPanel = useCallback(() => {
    setRightPanel((prev) => (prev === 'contact' ? 'none' : 'contact'));
  }, []);

  const handleToggleTemplatesPanel = useCallback(() => {
    setRightPanel((prev) => (prev === 'templates' ? 'none' : 'templates'));
  }, []);

  const handleConversationPermanentlyDeleted = useCallback(() => {
    setSelectedConversation(null);
  }, []);

  const handleOpenInboundChat = useCallback(() => {
    if (!inboundAlert) return;
    const c = conversations.find((x) => x.id === inboundAlert.conversationId);
    if (c) setSelectedConversation(c);
    setInboundAlert(null);
  }, [inboundAlert, conversations]);

  const handleConversationSelect = useCallback(
    (conversation: WhatsAppConversation) => {
      if (selectedConversation?.id === conversation.id) {
        if (focusPhone && onClearFocusPhone && conversationMatchesFocusPhone(focusPhone, conversation)) {
          onClearFocusPhone();
        }
        if (focusConversation && onClearFocusConversation && conversation.id === focusConversation) {
          onClearFocusConversation();
        }
        setSelectedConversation(null);
        return;
      }
      setSelectedConversation(conversation);
    },
    [selectedConversation?.id, focusPhone, onClearFocusPhone, focusConversation, onClearFocusConversation],
  );

  const handleContextMarkReadToggle = useCallback(async (conversation: WhatsAppConversation) => {
    try {
      const isUnread = conversation.unreadCount > 0 || conversation.crmForceUnread;
      if (isUnread) {
        await markAsRead(undefined, conversation.id, phoneNumberId);
        notifyAction('Conversación marcada como leída', 'success');
      } else {
        await patchWhatsAppConversationAdmin({
          conversationId: conversation.id,
          patch: { crmForceUnread: true },
        });
        notifyAction('Conversación marcada como no leída', 'success');
      }
    } catch {
      notifyAction('No se pudo cambiar el estado de lectura', 'error');
    }
  }, [phoneNumberId, notifyAction]);

  const handleContextArchiveToggle = useCallback(async (conversation: WhatsAppConversation) => {
    try {
      await patchWhatsAppConversationAdmin({
        conversationId: conversation.id,
        patch: { isArchived: !conversation.isArchived },
      });
      notifyAction(
        conversation.isArchived ? 'Conversación desarchivada' : 'Conversación archivada',
        'success',
      );
    } catch {
      notifyAction('No se pudo actualizar el archivo', 'error');
    }
  }, [notifyAction]);

  const handleContextPinToggle = useCallback(async (conversation: WhatsAppConversation) => {
    try {
      await patchWhatsAppConversationAdmin({
        conversationId: conversation.id,
        patch: { isPinned: !conversation.isPinned },
      });
      notifyAction(
        conversation.isPinned ? 'Conversación desfijada' : 'Conversación fijada',
        'success',
      );
    } catch {
      notifyAction('No se pudo fijar/desfijar', 'error');
    }
  }, [notifyAction]);

  const handleContextAssignTags = useCallback(async (
    conversation: WhatsAppConversation,
    tagIds: string[],
  ) => {
    try {
      await assignWhatsAppTags(conversation.id, tagIds);
      notifyAction('Tags actualizados', 'success');
      void loadTags();
    } catch {
      notifyAction('No se pudieron asignar los tags', 'error');
    }
  }, [loadTags, notifyAction]);

  const handleContextDeleteConversation = useCallback(async (conversation: WhatsAppConversation) => {
    const confirmed = window.prompt(
      `Para eliminar definitivamente la conversación de ${conversationShortLabel(conversation)}, escribe ${DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE}`,
    );
    if (confirmed !== DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE) return;
    try {
      await deleteWhatsAppConversationPermanently(
        conversation.id,
        DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE,
        { blockUser: false, deleteLeads: false, phoneNumberId },
      );
      if (selectedConversation?.id === conversation.id) {
        setSelectedConversation(null);
      }
      notifyAction('Conversación eliminada', 'success');
    } catch {
      notifyAction('No se pudo eliminar la conversación', 'error');
    }
  }, [phoneNumberId, selectedConversation?.id, notifyAction]);

  const handleContextBlockConversation = useCallback(async (conversation: WhatsAppConversation) => {
    const ok = window.confirm(
      `¿Marcar como spam y bloquear a ${conversationShortLabel(conversation)}?`,
    );
    if (!ok) return;
    try {
      await blockWhatsAppUser(conversation.id, phoneNumberId);
      notifyAction('Contacto bloqueado', 'success');
    } catch {
      notifyAction('No se pudo bloquear el contacto', 'error');
    }
  }, [phoneNumberId, notifyAction]);

  const handleBulkAssignTags = useCallback(async (
    conversationIds: string[],
    tagIds: string[],
    mode: 'add' | 'replace',
  ) => {
    if (conversationIds.length === 0 || tagIds.length === 0) return;
    const convById = new Map(conversations.map((c) => [c.id, c]));
    const result = await runBulk(conversationIds, async (id) => {
      const conv = convById.get(id);
      const nextTagIds = mode === 'replace'
        ? tagIds
        : [...new Set([...(conv?.tagIds ?? []), ...tagIds])];
      await assignWhatsAppTags(id, nextTagIds);
    });
    notifyBulkResult(notifyAction, 'con tags actualizados', result);
    if (result.ok > 0) void loadTags();
  }, [conversations, loadTags, notifyAction]);

  const handleBulkArchive = useCallback(async (conversationIds: string[], archive: boolean) => {
    if (conversationIds.length === 0) return;
    const result = await runBulk(conversationIds, async (id) => {
      await patchWhatsAppConversationAdmin({
        conversationId: id,
        patch: { isArchived: archive },
      });
    });
    notifyBulkResult(notifyAction, archive ? 'archivados' : 'desarchivados', result);
  }, [notifyAction]);

  const handleBulkMarkRead = useCallback(async (conversationIds: string[], read: boolean) => {
    if (conversationIds.length === 0) return;
    const convById = new Map(conversations.map((c) => [c.id, c]));
    const result = await runBulk(conversationIds, async (id) => {
      const conv = convById.get(id);
      if (read) {
        const isUnread = conv && (conv.unreadCount > 0 || conv.crmForceUnread);
        if (isUnread) {
          await markAsRead(undefined, id, phoneNumberId);
        }
      } else {
        await patchWhatsAppConversationAdmin({
          conversationId: id,
          patch: { crmForceUnread: true },
        });
      }
    });
    notifyBulkResult(notifyAction, read ? 'marcados como leídos' : 'marcados como no leídos', result);
  }, [conversations, phoneNumberId, notifyAction]);

  const handleBulkPin = useCallback(async (conversationIds: string[], pin: boolean) => {
    if (conversationIds.length === 0) return;
    const result = await runBulk(conversationIds, async (id) => {
      await patchWhatsAppConversationAdmin({
        conversationId: id,
        patch: { isPinned: pin },
      });
    });
    notifyBulkResult(notifyAction, pin ? 'fijados' : 'desfijados', result);
  }, [notifyAction]);

  const handleBulkDelete = useCallback(async (conversationIds: string[]) => {
    if (conversationIds.length === 0) return;
    const confirmed = window.prompt(
      `Para eliminar definitivamente ${conversationIds.length} conversación${conversationIds.length === 1 ? '' : 'es'}, escribe ${DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE}`,
    );
    if (confirmed !== DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE) return;
    const result = await runBulk(conversationIds, async (id) => {
      await deleteWhatsAppConversationPermanently(
        id,
        DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE,
        { blockUser: false, deleteLeads: false, phoneNumberId },
      );
    });
    if (selectedConversation && conversationIds.includes(selectedConversation.id) && result.ok > 0) {
      setSelectedConversation(null);
    }
    notifyBulkResult(notifyAction, 'eliminados', result);
  }, [phoneNumberId, selectedConversation, notifyAction]);

  const showRightColumn = Boolean(selectedConversation && rightPanel !== 'none');

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 96px)',
        '@keyframes waInboundPulse': {
          '0%': {
            boxShadow: `0 0 0 0 ${alpha(theme.palette.primary.main, 0.35)}`,
          },
          '70%': {
            boxShadow: `0 0 0 12px ${alpha(theme.palette.primary.main, 0)}`,
          },
          '100%': {
            boxShadow: `0 0 0 0 ${alpha(theme.palette.primary.main, 0)}`,
          },
        },
        animation: inboundPulse ? 'waInboundPulse 1.2s ease-out' : 'none',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flex: 1,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          bgcolor: 'background.paper',
        }}
      >
        <Box
          data-tour="whatsapp-inbox-list"
          sx={{
            width: { xs: '100%', sm: 520, md: 600 },
            minWidth: 320,
            maxWidth: 720,
            borderRight: 1,
            borderColor: 'divider',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {inboxError && (
            <Alert
              severity="error"
              sx={{ m: 1, flexShrink: 0 }}
              action={
                <Button color="inherit" size="small" onClick={handleRetryInbox}>
                  Reintentar
                </Button>
              }
            >
              {inboxError}
            </Alert>
          )}
          <ConversationList
            conversations={conversations}
            tabCounts={inboxMetrics.tabCounts}
            tagCountsById={inboxMetrics.tagCountsById}
            archivedTagCountsById={inboxMetrics.archivedTagCountsById}
            categoryTagIds={inboxMetrics.categoryTagIds}
            selectedId={selectedConversation?.id ?? null}
            onSelect={handleConversationSelect}
            loading={loading}
            tags={tags}
            onManageTags={() => setTagManagerOpen(true)}
            onNewContact={() => setNewContactOpen(true)}
            presenceByConversationId={presenceByConversationId}
            onMarkReadToggle={handleContextMarkReadToggle}
            onArchiveToggle={handleContextArchiveToggle}
            onPinToggle={handleContextPinToggle}
            onAssignTags={handleContextAssignTags}
            onDeleteConversation={handleContextDeleteConversation}
            onBlockConversation={handleContextBlockConversation}
            onBulkAssignTags={handleBulkAssignTags}
            onBulkArchive={handleBulkArchive}
            onBulkMarkRead={handleBulkMarkRead}
            onBulkPin={handleBulkPin}
            onBulkDelete={handleBulkDelete}
            onConfigureOutOfCoverage={() => setOutOfCoverageDialogOpen(true)}
          />
        </Box>

        <Box data-tour="whatsapp-inbox-chat" sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {selectedConversation ? (
            <ChatArea
              conversation={selectedConversation}
              phoneNumberId={phoneNumberId}
              wabaId={wabaId}
              headerDisplayName={contactCtx.displayName ?? ''}
              headerPhotoUrl={contactCtx.photoUrl}
              onToggleContactPanel={handleToggleContactPanel}
              contactPanelOpen={rightPanel === 'contact'}
              templatesPanelOpen={rightPanel === 'templates'}
              onToggleTemplatesPanel={handleToggleTemplatesPanel}
              externalDraft={composerDraft}
              onExternalDraftConsumed={() => setComposerDraft('')}
              tags={tags}
              onTagsChanged={loadTags}
              onManageTags={() => setTagManagerOpen(true)}
              onConversationPermanentlyDeleted={handleConversationPermanentlyDeleted}
              snippets={snippets}
              myUid={myUid}
              myDisplayName={myDisplayName}
              peerPresences={peersInSelectedChat}
            />
          ) : (
            <WhatsAppEmptyState />
          )}
        </Box>

        {showRightColumn && selectedConversation && rightPanel === 'templates' && canShowTemplates && wabaId && phoneNumberId && (
          <TemplatesSidePanel
            wabaId={wabaId}
            phoneNumberId={phoneNumberId}
            recipientPhone={recipientPhoneForTemplates}
            onApplyDraftToComposer={setComposerDraft}
            snippets={snippets}
            onSnippetsChanged={loadSnippets}
            conversationStableKey={selectedConversation.phone || selectedConversation.id}
            conversationDisplayName={contactCtx.displayName ?? undefined}
            lastInboundAt={
              selectedConversation.lastMessageDirection === 'inbound'
                ? selectedConversation.lastMessageAt ?? null
                : null
            }
            lastMessageDirection={selectedConversation.lastMessageDirection}
          />
        )}

        {showRightColumn && selectedConversation && rightPanel === 'contact' && (
          <WhatsAppContactSidePanel
            conversation={selectedConversation}
            contact={contactCtx}
          />
        )}
      </Box>

      <Snackbar
        open={Boolean(inboundAlert)}
        autoHideDuration={6000}
        onClose={() => setInboundAlert(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="info"
          variant="filled"
          onClose={() => setInboundAlert(null)}
          action={
            <Button color="inherit" size="small" onClick={handleOpenInboundChat}>
              Ver chat
            </Button>
          }
        >
          {inboundAlert?.message}
        </Alert>
      </Snackbar>

      <Snackbar
        open={actionSnack.open}
        autoHideDuration={3500}
        onClose={() => setActionSnack((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={actionSnack.severity}
          variant="filled"
          onClose={() => setActionSnack((prev) => ({ ...prev, open: false }))}
        >
          {actionSnack.message}
        </Alert>
      </Snackbar>

      <NewContactDialog
        open={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        phoneNumberId={phoneNumberId}
        onCreated={handleContactCreated}
      />

      <TagManagerDialog
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        tags={tags}
        tagCounts={inboxMetrics.tagCountsById}
        onTagsChanged={loadTags}
      />

      <OutOfCoverageTagsDialog
        open={outOfCoverageDialogOpen}
        onClose={() => setOutOfCoverageDialogOpen(false)}
        tags={tags}
        currentTagIds={inboxMetrics.categoryTagIds.fuera_cobertura}
        onSaved={(tagIds) => {
          setCategoryTagOverrides({ fuera_cobertura: tagIds });
          notifyAction('Tags de Fuera de cobertura actualizados', 'success');
        }}
      />
    </Box>
  );
};

export default WhatsAppLayout;
