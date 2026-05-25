import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, CircularProgress, Snackbar, Alert, Button } from '@mui/material';
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
  DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE,
  type WhatsAppConversation,
  type WhatsAppTag,
  type WhatsAppSnippet,
  type WhatsAppAdminPresence,
} from '@/services/whatsappService';
import TagManagerDialog from './TagManagerDialog';
import NewContactDialog from './NewContactDialog';
import {
  computeWhatsAppInboxMetrics,
  type WhatsAppInboxMetrics,
} from '@/utils/whatsappInboxStats';

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

function conversationShortLabel(c: WhatsAppConversation): string {
  return (
    c.contactName?.trim() ||
    c.whatsappProfileName?.trim() ||
    c.contactPhone?.trim() ||
    c.phone?.trim() ||
    'Chat'
  );
}

type RightPanelMode = 'none' | 'templates' | 'contact';

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
  fullscreen?: boolean;
  focusPhone?: string;
  /** Llamar al cerrar el chat que coincidía con `focusPhone` (p. ej. quitar el query de la URL). */
  onClearFocusPhone?: () => void;
  globalAutomationEnabled: boolean | null;
  globalAutomationLoading: boolean;
  /** Métricas del inbox (contactos totales, tabs, tags) para cabeceras externas o analítica. */
  onInboxMetrics?: (metrics: WhatsAppInboxMetrics) => void;
}

const WhatsAppLayout: React.FC<WhatsAppLayoutProps> = ({
  phoneNumberId,
  wabaId,
  fullscreen,
  focusPhone,
  onClearFocusPhone,
  globalAutomationEnabled,
  globalAutomationLoading,
  onInboxMetrics,
}) => {
  const theme = useTheme();
  const { user, profile } = useAuth();
  const [conversations, setConversations] = useState<WhatsAppConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<WhatsAppConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanelMode>('none');
  const [composerDraft, setComposerDraft] = useState('');
  const [tags, setTags] = useState<WhatsAppTag[]>([]);
  const [snippets, setSnippets] = useState<WhatsAppSnippet[]>([]);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [newContactOpen, setNewContactOpen] = useState(false);

  const [inboundAlert, setInboundAlert] = useState<{ message: string; conversationId: string } | null>(null);
  const [inboundPulse, setInboundPulse] = useState(false);
  const [actionSnack, setActionSnack] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({ open: false, message: '', severity: 'success' });

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

  const inboxMetrics = useMemo(() => computeWhatsAppInboxMetrics(conversations), [conversations]);

  useEffect(() => {
    onInboxMetrics?.(inboxMetrics);
  }, [inboxMetrics, onInboxMetrics]);

  useEffect(() => {
    notifyAudioRef.current = new Audio(INBOUND_NOTIFY_AUDIO);
  }, []);

  useEffect(() => {
    inboundBaselineReadyRef.current = false;
    inboundPrevSnapshotRef.current = new Map();
  }, [phoneNumberId]);

  useEffect(() => {
    setLoading(true);
    setSelectedConversation(null);

    const unsub = subscribeToConversations(
      (convs) => {
        setConversations(convs);
        setLoading(false);
      },
      phoneNumberId,
      (error) => {
        console.error('Error en listener de conversaciones:', error);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [phoneNumberId]);

  const loadTags = useCallback(async () => {
    try {
      const result = await listWhatsAppTags();
      setTags(result);
    } catch (err) {
      console.error('Error loading tags:', err);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  useEffect(() => {
    listWhatsAppSnippets()
      .then(setSnippets)
      .catch((err) => console.error('Error loading snippets:', err));
  }, []);

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

    void notifyAudioRef.current?.play().catch(() => {});
    setInboundAlert({
      message: `Nuevo mensaje en ${conversationShortLabel(best)}`,
      conversationId: best.id,
    });
    setInboundPulse(true);
    window.setTimeout(() => setInboundPulse(false), 1400);
  }, [conversations, loading]);

  useEffect(() => {
    if (selectedConversation) {
      const updated = conversations.find((c) => c.id === selectedConversation.id);
      if (updated) setSelectedConversation(updated);
    }
  }, [conversations]);

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
        setSelectedConversation(null);
        return;
      }
      setSelectedConversation(conversation);
    },
    [selectedConversation?.id, focusPhone, onClearFocusPhone],
  );

  const handleContextMarkReadToggle = useCallback(async (conversation: WhatsAppConversation) => {
    try {
      const isUnread = conversation.unreadCount > 0 || conversation.crmForceUnread;
      if (isUnread) {
        await markAsRead(undefined, conversation.id, phoneNumberId);
        setActionSnack({ open: true, message: 'Conversación marcada como leída', severity: 'success' });
      } else {
        await patchWhatsAppConversationAdmin({
          conversationId: conversation.id,
          patch: { crmForceUnread: true },
        });
        setActionSnack({ open: true, message: 'Conversación marcada como no leída', severity: 'success' });
      }
    } catch {
      setActionSnack({ open: true, message: 'No se pudo cambiar el estado de lectura', severity: 'error' });
    }
  }, [phoneNumberId]);

  const handleContextArchiveToggle = useCallback(async (conversation: WhatsAppConversation) => {
    try {
      await patchWhatsAppConversationAdmin({
        conversationId: conversation.id,
        patch: { isArchived: !conversation.isArchived },
      });
      setActionSnack({
        open: true,
        message: conversation.isArchived ? 'Conversación desarchivada' : 'Conversación archivada',
        severity: 'success',
      });
    } catch {
      setActionSnack({ open: true, message: 'No se pudo actualizar el archivo', severity: 'error' });
    }
  }, []);

  const handleContextPinToggle = useCallback(async (conversation: WhatsAppConversation) => {
    try {
      await patchWhatsAppConversationAdmin({
        conversationId: conversation.id,
        patch: { isPinned: !conversation.isPinned },
      });
      setActionSnack({
        open: true,
        message: conversation.isPinned ? 'Conversación desfijada' : 'Conversación fijada',
        severity: 'success',
      });
    } catch {
      setActionSnack({ open: true, message: 'No se pudo fijar/desfijar', severity: 'error' });
    }
  }, []);

  const handleContextAssignTags = useCallback(async (
    conversation: WhatsAppConversation,
    tagIds: string[],
  ) => {
    try {
      await assignWhatsAppTags(conversation.id, tagIds);
      setActionSnack({ open: true, message: 'Tags actualizados', severity: 'success' });
      void loadTags();
    } catch {
      setActionSnack({ open: true, message: 'No se pudieron asignar los tags', severity: 'error' });
    }
  }, [loadTags]);

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
      setActionSnack({ open: true, message: 'Conversación eliminada', severity: 'success' });
    } catch {
      setActionSnack({ open: true, message: 'No se pudo eliminar la conversación', severity: 'error' });
    }
  }, [phoneNumberId, selectedConversation?.id]);

  const handleContextBlockConversation = useCallback(async (conversation: WhatsAppConversation) => {
    const ok = window.confirm(
      `¿Marcar como spam y bloquear a ${conversationShortLabel(conversation)}?`,
    );
    if (!ok) return;
    try {
      await blockWhatsAppUser(conversation.id, phoneNumberId);
      setActionSnack({ open: true, message: 'Contacto bloqueado', severity: 'success' });
    } catch {
      setActionSnack({ open: true, message: 'No se pudo bloquear el contacto', severity: 'error' });
    }
  }, [phoneNumberId]);

  const showRightColumn = Boolean(selectedConversation && rightPanel !== 'none');

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: fullscreen ? '100%' : 'calc(100vh - 160px)',
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
          border: fullscreen ? 'none' : 1,
          borderColor: 'divider',
          borderRadius: fullscreen ? 0 : 1,
          overflow: 'hidden',
          bgcolor: 'background.paper',
        }}
      >
        <Box
          data-tour="whatsapp-inbox-list"
          sx={{
            width: fullscreen ? 500 : 440,
            minWidth: 320,
            borderRight: 1,
            borderColor: 'divider',
            flexShrink: 0,
          }}
        >
          <ConversationList
            conversations={conversations}
            tabCounts={inboxMetrics.tabCounts}
            tagCountsById={inboxMetrics.tagCountsById}
            selectedId={selectedConversation?.id ?? null}
            onSelect={handleConversationSelect}
            loading={loading}
            selectedResolved={
              selectedConversation
                ? {
                    conversationId: selectedConversation.id,
                    displayName: contactCtx.displayName ?? '',
                    photoUrl: contactCtx.photoUrl,
                  }
                : undefined
            }
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
              globalAutomationEnabled={globalAutomationEnabled}
              globalAutomationLoading={globalAutomationLoading}
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
          />
        )}

        {showRightColumn && selectedConversation && rightPanel === 'contact' && (
          <WhatsAppContactSidePanel
            conversation={selectedConversation}
            contact={contactCtx}
            canShowTemplates={canShowTemplates}
            onBackToTemplates={() => setRightPanel('templates')}
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
    </Box>
  );
};

export default WhatsAppLayout;
