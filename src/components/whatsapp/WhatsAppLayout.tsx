import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button } from '@mui/material';
import { crmToast } from '@/utils/crmToast';
import { alpha, useTheme } from '@mui/material/styles';
import ConversationList from './ConversationList';
import ChatArea from './ChatArea';
import WhatsAppEmptyState from './WhatsAppEmptyState';
import TemplatesSidePanel from './TemplatesSidePanel';
import WhatsAppContactSidePanel from './WhatsAppContactSidePanel';
import { useWhatsAppContactContext } from '@/hooks/useWhatsAppContactContext';
import { useAuth } from '@/hooks/useAuth';
import { useInboxConversations } from '@/hooks/useInboxConversations';
import {
  subscribeToConversations,
  subscribeToWhatsAppAdminPresence,
  clearMyWhatsAppPresence,
  listWhatsAppTags,
  listWhatsAppTagFolders,
  listWhatsAppSnippets,
  assignWhatsAppTags,
  blockWhatsAppUser,
  deleteWhatsAppConversationPermanently,
  markAsRead,
  patchWhatsAppConversationAdmin,
  getInboxCategorySettings,
  DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE,
  backfillWhatsAppConversationLine,
  fetchConversationByStableKey,
  type FetchConversationsOptions,
  type WhatsAppConversation,
  type WhatsAppTag,
  type WhatsAppTagFolder,
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
import { dedupePresencesByUid } from '@/utils/whatsappAdminPresence';
import { clearAllComposerDrafts } from '@/utils/messageComposerDraftStore';
import { playInboxSound } from '@/utils/inboxSounds';
import { inboxLineHex, inboxLineLabel } from '@/utils/inboxLineVisual';
import {
  canShowDesktopNotifications,
  showInboundMessageNotification,
} from '@/utils/desktopNotifications';
import type { LoadedConversationInbound } from '@/utils/whatsappTemplateSuggestions';
import useSoundEffects from '@/hooks/useSoundEffects';

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
import {
  BOT_PHONE_NUMBER_ID,
  COMMERCIAL_PHONE_NUMBER_ID,
  customerPhoneFromStableKey,
  isCommercialPhoneNumberId,
  phoneNumberIdForFilter,
  resolveWhatsAppLine,
  siblingConversationStableKey,
  wabaIdForLine,
  type WhatsAppLineFilter,
} from '@/utils/whatsappLines';
import {
  conversationBelongsToLineFilter,
  isCommercialConversationRef,
  preferConversationForFilter,
} from '@/utils/whatsappTabs';
import type { WhatsAppFocusChatDetail } from '@/utils/desktopNotifications';
import {
  detectNewInboundConversations,
  pickLatestInbound,
} from '@/utils/whatsappInboundAlerts';

function conversationShortLabel(c: WhatsAppConversation): string {
  return resolveContactDisplayName({
    contactName: c.contactName,
    whatsappProfileName: c.whatsappProfileName,
    phone: c.contactPhone ?? c.phone,
    conversationId: c.id,
    contactNameLocked: c.contactNameLocked,
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

function digitsOnly(value: string | undefined | null): string {
  return (value ?? '').replace(/\D/g, '');
}

function conversationMatchesFocusPhone(
  focusPhone: string | undefined,
  c: WhatsAppConversation,
): boolean {
  if (!focusPhone) return false;
  if (c.phone === focusPhone || c.contactPhone === focusPhone) return true;
  const fd = digitsOnly(customerPhoneFromStableKey(focusPhone));
  if (!fd) return false;
  return (
    fd === digitsOnly(customerPhoneFromStableKey(c.id)) ||
    fd === digitsOnly(c.phone) ||
    fd === digitsOnly(c.contactPhone)
  );
}

/** Match deep-link `?conversation=` against stable_key or customer phone digits. */
function conversationMatchesFocusKey(
  focusKey: string | undefined,
  c: WhatsAppConversation,
): boolean {
  if (!focusKey) return false;
  if (c.id === focusKey) return true;
  const kd = digitsOnly(customerPhoneFromStableKey(focusKey));
  if (!kd) return false;
  return (
    kd === digitsOnly(customerPhoneFromStableKey(c.id)) ||
    kd === digitsOnly(c.phone) ||
    kd === digitsOnly(c.contactPhone)
  );
}

interface WhatsAppLayoutProps {
  phoneNumberId?: string;
  wabaId?: string;
  lineFilter?: WhatsAppLineFilter;
  onOpenConversation?: (detail: WhatsAppFocusChatDetail) => void;
  focusPhone?: string;
  /** Llamar al cerrar el chat que coincidía con `focusPhone` (p. ej. quitar el query de la URL). */
  onClearFocusPhone?: () => void;
  focusConversation?: string;
  /** Llamar al cerrar el chat que coincidía con `focusConversation` (p. ej. quitar el query de la URL). */
  onClearFocusConversation?: () => void;
  /** Quita conversation + focusPhone de la URL (deep-link de un solo uso). */
  onClearFocusDeepLink?: () => void;
  /** Métricas del inbox (contactos totales, tabs, tags) para cabeceras externas o analítica. */
  onInboxMetrics?: (metrics: WhatsAppInboxMetrics) => void;
}

const WhatsAppLayout: React.FC<WhatsAppLayoutProps> = ({
  phoneNumberId,
  wabaId,
  lineFilter = 'bot',
  onOpenConversation,
  focusPhone,
  onClearFocusPhone,
  focusConversation,
  onClearFocusConversation,
  onClearFocusDeepLink,
  onInboxMetrics,
}) => {
  const theme = useTheme();
  const { user, profile, session, loading: authLoading } = useAuth();
  const [selectedConversation, setSelectedConversation] = useState<WhatsAppConversation | null>(null);
  const [loadedConversationInbound, setLoadedConversationInbound] =
    useState<LoadedConversationInbound | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanelMode>('none');
  const [composerDraft, setComposerDraft] = useState('');
  const [tags, setTags] = useState<WhatsAppTag[]>([]);
  const [tagFolders, setTagFolders] = useState<WhatsAppTagFolder[]>([]);
  const [snippets, setSnippets] = useState<WhatsAppSnippet[]>([]);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [outOfCoverageDialogOpen, setOutOfCoverageDialogOpen] = useState(false);
  const [categoryTagOverrides, setCategoryTagOverrides] = useState<CategoryTagIdOverrides>({});

  const [inboundPulseLine, setInboundPulseLine] = useState<'bot' | 'commercial' | null>(null);

  const { playSuccess, playError } = useSoundEffects();

  const notifyAction = useCallback((message: string, severity: 'success' | 'error') => {
    crmToast.show(severity, message);
    if (severity === 'success') playSuccess();
    else playError();
  }, [playSuccess, playError]);

  const listPhoneNumberId = lineFilter === 'all' ? undefined : phoneNumberIdForFilter(lineFilter);
  const listFetchOptions = useMemo<FetchConversationsOptions>(
    () => ({ includeOrphans: lineFilter !== 'commercial' }),
    [lineFilter],
  );
  const inboxQuery = useInboxConversations(
    listPhoneNumberId,
    listFetchOptions,
    Boolean(!authLoading && session?.access_token),
  );
  const conversations = inboxQuery.conversations;
  const loading = inboxQuery.loading;
  const inboxError = inboxQuery.error?.message ?? null;
  const botPhoneNumberId = phoneNumberId || BOT_PHONE_NUMBER_ID;
  const [siblingCommercialHint, setSiblingCommercialHint] = useState<{
    unreadCount: number;
    lastMessageAt?: Date;
    conversationId: string;
  } | null>(null);

  const inboundBaselineReadyRef = useRef(false);
  const inboundPrevSnapshotRef = useRef<Map<string, number>>(new Map());
  const siblingInboundBaselineReadyRef = useRef(false);
  const siblingInboundPrevSnapshotRef = useRef<Map<string, number>>(new Map());
  const [siblingAlertConversations, setSiblingAlertConversations] = useState<WhatsAppConversation[]>([]);
  const focusRefetchAttemptedRef = useRef<string | null>(null);
  /** Token del deep-link ya aplicado (evita re-seleccionar mientras se limpia la URL). */
  const appliedDeepLinkTokenRef = useRef<string | null>(null);

  // Presencia entre admins (otras pestañas / otros usuarios viendo el inbox).
  const [presenceEntries, setPresenceEntries] = useState<WhatsAppAdminPresence[]>([]);

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
    inboundBaselineReadyRef.current = false;
    inboundPrevSnapshotRef.current = new Map();
    siblingInboundBaselineReadyRef.current = false;
    siblingInboundPrevSnapshotRef.current = new Map();
    setSiblingAlertConversations([]);
    appliedDeepLinkTokenRef.current = null;
    focusRefetchAttemptedRef.current = null;
    clearAllComposerDrafts();
    setSelectedConversation(null);
  }, [phoneNumberId, lineFilter]);

  const refetchInbox = inboxQuery.refetch;
  const handleRetryInbox = useCallback(() => {
    void refetchInbox();
  }, [refetchInbox]);

  useEffect(() => {
    if (authLoading || !session?.access_token || !botPhoneNumberId || lineFilter === 'commercial') return;

    const storageKey = `wa_line_backfill_v1_${botPhoneNumberId}`;
    try {
      if (sessionStorage.getItem(storageKey) === '1') return;
    } catch {
      /* private mode / blocked storage */
    }

    let cancelled = false;
    void (async () => {
      try {
        const dry = await backfillWhatsAppConversationLine({
          phoneNumberId: botPhoneNumberId,
          dryRun: true,
        });
        if (cancelled) return;
        if (dry.orphanCount > 0) {
          const result = await backfillWhatsAppConversationLine({
            phoneNumberId: botPhoneNumberId,
            dryRun: false,
          });
          if (cancelled) return;
          if (result.updatedCount > 0) {
            await refetchInbox();
          }
        }
        try {
          sessionStorage.setItem(storageKey, '1');
        } catch {
          /* ignore */
        }
      } catch (err) {
        console.error('Auto-backfill conversation line failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, session?.access_token, botPhoneNumberId, lineFilter, refetchInbox]);

  useEffect(() => {
    if (authLoading || !session?.access_token || lineFilter === 'all') {
      setSiblingAlertConversations([]);
      return;
    }
    const siblingFilter = lineFilter === 'commercial' ? 'bot' : 'commercial';
    const siblingPhoneNumberId = phoneNumberIdForFilter(siblingFilter);
    return subscribeToConversations(
      setSiblingAlertConversations,
      siblingPhoneNumberId,
      undefined,
      { includeOrphans: siblingFilter !== 'commercial' },
    );
  }, [authLoading, session?.access_token, lineFilter]);

  const loadTags = useCallback(async () => {
    try {
      const [tagResult, folderResult] = await Promise.all([
        listWhatsAppTags(),
        listWhatsAppTagFolders(),
      ]);
      setTags(tagResult);
      setTagFolders(folderResult);
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

  const openInboundConversation = useCallback((conversationId: string) => {
    if (focusPhone || focusConversation) {
      if (onClearFocusDeepLink) onClearFocusDeepLink();
      else {
        onClearFocusPhone?.();
        onClearFocusConversation?.();
      }
    }
    const inCurrentList = conversations.find((x) => x.id === conversationId);
    const sibling = siblingAlertConversations.find((x) => x.id === conversationId);
    const target = inCurrentList ?? sibling;
    if (target && onOpenConversation) {
      onOpenConversation({
        conversationId: target.id,
        phone: target.contactPhone || target.phone,
        phoneNumberId: target.phoneNumberId,
      });
    } else if (inCurrentList) {
      setSelectedConversation(inCurrentList);
    }
  }, [
    conversations,
    siblingAlertConversations,
    onOpenConversation,
    focusPhone,
    focusConversation,
    onClearFocusDeepLink,
    onClearFocusPhone,
    onClearFocusConversation,
  ]);

  const announceInbound = useCallback((best: WhatsAppConversation, opts?: { snackbar?: boolean }) => {
    const contactLabel = conversationShortLabel(best);
    const notifyPhone = best.contactPhone || best.phone || '';
    const line = resolveWhatsAppLine(best.phoneNumberId);

    playInboxSound(line, 'inbound');

    if (document.hidden && canShowDesktopNotifications()) {
      showInboundMessageNotification({
        title: line === 'commercial' ? 'Inbox Comercial' : 'Inbox Bot',
        body: contactLabel,
        conversationId: best.id,
        phone: notifyPhone,
        phoneNumberId: best.phoneNumberId,
        line,
      });
    }

    if (!document.hidden && opts?.snackbar !== false) {
      crmToast.inbound({
        line,
        title: `${inboxLineLabel(line)} · Nuevo mensaje`,
        description: contactLabel,
        onView: () => openInboundConversation(best.id),
      });
    }
    setInboundPulseLine(line);
    window.setTimeout(() => setInboundPulseLine(null), 1400);
  }, [openInboundConversation]);

  useEffect(() => {
    if (loading) return;

    const { nextSnapshot, candidates } = detectNewInboundConversations(
      conversations,
      inboundPrevSnapshotRef.current,
    );

    if (!inboundBaselineReadyRef.current) {
      inboundBaselineReadyRef.current = true;
      inboundPrevSnapshotRef.current = nextSnapshot;
      return;
    }

    inboundPrevSnapshotRef.current = nextSnapshot;
    const best = pickLatestInbound(candidates);
    if (best) announceInbound(best);
  }, [announceInbound, conversations, loading]);

  useEffect(() => {
    if (lineFilter === 'all') return;

    const { nextSnapshot, candidates } = detectNewInboundConversations(
      siblingAlertConversations,
      siblingInboundPrevSnapshotRef.current,
    );

    if (!siblingInboundBaselineReadyRef.current) {
      siblingInboundBaselineReadyRef.current = true;
      siblingInboundPrevSnapshotRef.current = nextSnapshot;
      return;
    }

    siblingInboundPrevSnapshotRef.current = nextSnapshot;
    const best = pickLatestInbound(candidates);
    if (best) announceInbound(best);
  }, [announceInbound, lineFilter, siblingAlertConversations]);

  useEffect(() => {
    if (selectedConversation) {
      const updated = conversations.find((c) => c.id === selectedConversation.id);
      if (updated) setSelectedConversation(updated);
    }
  }, [conversations, selectedConversation]);

  useEffect(() => {
    const presenceLineId = listPhoneNumberId || botPhoneNumberId;
    if (!presenceLineId || !myUid) {
      setPresenceEntries([]);
      return;
    }
    const unsub = subscribeToWhatsAppAdminPresence(
      presenceLineId,
      myUid,
      (entries) => setPresenceEntries(entries),
      (err) => console.error('Error en listener de presencia WhatsApp:', err),
    );
    return () => unsub();
  }, [listPhoneNumberId, botPhoneNumberId, myUid]);

  useEffect(() => {
    if (!myUid) return;
    return () => {
      void clearMyWhatsAppPresence(myUid);
    };
  }, [myUid]);

  const livePeerPresences = useMemo(() => {
    const live = presenceEntries.filter((p) => {
      if (!p.uid || p.uid === myUid) return false;
      if (p.activity === 'none' || !p.conversationId) return false;
      return true;
    });
    return dedupePresencesByUid(live);
  }, [presenceEntries, myUid]);

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
    if (!focusConversation && !focusPhone) {
      appliedDeepLinkTokenRef.current = null;
      focusRefetchAttemptedRef.current = null;
      return;
    }
    if (conversations.length === 0) return;

    const focusToken = `${focusConversation ?? ''}|${focusPhone ?? ''}`;
    // Ya aplicamos este deep-link: no volver a forzar selección (evita pelear con clics del usuario).
    if (appliedDeepLinkTokenRef.current === focusToken) return;

    const lineConversations = conversations.filter((c) =>
      conversationBelongsToLineFilter(c, lineFilter),
    );
    const exact = focusConversation
      ? lineConversations.find((c) => c.id === focusConversation)
      : undefined;
    const matches = lineConversations.filter(
      (c) =>
        (Boolean(focusConversation) && conversationMatchesFocusKey(focusConversation, c)) ||
        (Boolean(focusPhone) && conversationMatchesFocusPhone(focusPhone, c)),
    );
    const match = exact ?? preferConversationForFilter(matches, lineFilter);

    if (match) {
      appliedDeepLinkTokenRef.current = focusToken;
      setSelectedConversation(match);
      // One-shot: limpia la URL para que el inbox vuelva a ser selección libre.
      if (onClearFocusDeepLink) {
        onClearFocusDeepLink();
      } else {
        onClearFocusPhone?.();
        onClearFocusConversation?.();
      }
      return;
    }

    // Sin match aún: un refetch único (chat recién creado / backfill de línea).
    if (focusRefetchAttemptedRef.current === focusToken) return;
    focusRefetchAttemptedRef.current = focusToken;
    void refetchInbox();
  }, [
    focusConversation,
    focusPhone,
    conversations,
    lineFilter,
    refetchInbox,
    onClearFocusDeepLink,
    onClearFocusPhone,
    onClearFocusConversation,
  ]);

  const recipientPhoneForTemplates = selectedConversation
    ? selectedConversation.contactPhone
      || selectedConversation.phone
      || customerPhoneFromStableKey(selectedConversation.id)
    : '';
  const activePhoneNumberId =
    selectedConversation?.phoneNumberId || phoneNumberId || botPhoneNumberId;
  const activeWabaId = selectedConversation
    ? wabaIdForLine(
        isCommercialConversationRef({
          conversationId: selectedConversation.id,
          phoneNumberId: selectedConversation.phoneNumberId,
        })
          ? 'commercial'
          : 'bot',
      )
    : wabaId;
  const templateRecipientDigits = recipientPhoneForTemplates.replace(/\D/g, '');
  const canShowTemplates =
    Boolean(selectedConversation && activeWabaId && activePhoneNumberId) &&
    templateRecipientDigits.length >= 10;
  const templateLastInboundAt =
    loadedConversationInbound &&
    loadedConversationInbound.conversationId === selectedConversation?.id
      ? loadedConversationInbound.lastInboundAt
      : selectedConversation?.lastMessageDirection === 'inbound'
        ? selectedConversation.lastMessageAt ?? null
        : null;

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

  useEffect(() => {
    if (!selectedConversation || isCommercialPhoneNumberId(selectedConversation.phoneNumberId)) {
      setSiblingCommercialHint(null);
      return;
    }
    const siblingKey = siblingConversationStableKey(selectedConversation.id);
    if (!siblingKey) {
      setSiblingCommercialHint(null);
      return;
    }
    let cancelled = false;
    void fetchConversationByStableKey(siblingKey)
      .then((sibling) => {
        if (cancelled || !sibling) {
          if (!cancelled) setSiblingCommercialHint(null);
          return;
        }
        const siblingTime = sibling.lastMessageAt?.getTime() ?? 0;
        const selectedTime = selectedConversation.lastMessageAt?.getTime() ?? 0;
        if (sibling.unreadCount > 0 && siblingTime >= selectedTime) {
          setSiblingCommercialHint({
            unreadCount: sibling.unreadCount,
            lastMessageAt: sibling.lastMessageAt,
            conversationId: sibling.id,
          });
        } else {
          setSiblingCommercialHint(null);
        }
      })
      .catch(() => {
        if (!cancelled) setSiblingCommercialHint(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedConversation]);

  const handleConversationSelect = useCallback(
    (conversation: WhatsAppConversation) => {
      // Cualquier clic manual invalida el deep-link pegado en la URL.
      if (focusPhone || focusConversation) {
        if (onClearFocusDeepLink) {
          onClearFocusDeepLink();
        } else {
          onClearFocusPhone?.();
          onClearFocusConversation?.();
        }
      }

      if (selectedConversation?.id === conversation.id) {
        setSelectedConversation(null);
        return;
      }
      setSelectedConversation(conversation);
    },
    [
      selectedConversation?.id,
      focusPhone,
      focusConversation,
      onClearFocusDeepLink,
      onClearFocusPhone,
      onClearFocusConversation,
    ],
  );

  const handleContextMarkReadToggle = useCallback(async (conversation: WhatsAppConversation) => {
    try {
      const isUnread = conversation.unreadCount > 0 || conversation.crmForceUnread;
      if (isUnread) {
        await markAsRead(undefined, conversation.id, conversation.phoneNumberId || phoneNumberId);
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
    changes: { addTagIds: string[]; removeTagIds: string[] },
  ) => {
    const { addTagIds, removeTagIds } = changes;
    if (conversationIds.length === 0) return;
    if (addTagIds.length === 0 && removeTagIds.length === 0) return;
    const removeSet = new Set(removeTagIds);
    const convById = new Map(conversations.map((c) => [c.id, c]));
    const result = await runBulk(conversationIds, async (id) => {
      const conv = convById.get(id);
      const current = conv?.tagIds ?? [];
      const nextTagIds = [
        ...new Set([
          ...current.filter((tagId) => !removeSet.has(tagId)),
          ...addTagIds,
        ]),
      ];
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
          const conv = conversations.find((item) => item.id === id);
          await markAsRead(undefined, id, conv?.phoneNumberId || phoneNumberId);
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
            boxShadow: `0 0 0 0 ${alpha(inboundPulseLine ? inboxLineHex(inboundPulseLine) : theme.palette.primary.main, 0.4)}`,
          },
          '70%': {
            boxShadow: `0 0 0 12px ${alpha(inboundPulseLine ? inboxLineHex(inboundPulseLine) : theme.palette.primary.main, 0)}`,
          },
          '100%': {
            boxShadow: `0 0 0 0 ${alpha(inboundPulseLine ? inboxLineHex(inboundPulseLine) : theme.palette.primary.main, 0)}`,
          },
        },
        animation: inboundPulseLine ? 'waInboundPulse 1.2s ease-out' : 'none',
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
          data-testid="inbox-conversation-pane"
          data-inbox-ready={loading ? 'false' : 'true'}
          sx={{
            width: { xs: '100%', sm: 'auto' },
            minWidth: 0,
            borderRight: 1,
            borderColor: 'divider',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          {siblingCommercialHint && (
            <Alert
              severity="warning"
              sx={{ m: 1, flexShrink: 0 }}
              action={
                onOpenConversation ? (
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => {
                      onOpenConversation({
                        conversationId: siblingCommercialHint.conversationId,
                        phoneNumberId: COMMERCIAL_PHONE_NUMBER_ID,
                      });
                      setSelectedConversation(null);
                    }}
                  >
                    Ver comercial
                  </Button>
                ) : undefined
              }
            >
              La línea comercial tiene {siblingCommercialHint.unreadCount} mensaje
              {siblingCommercialHint.unreadCount === 1 ? '' : 's'} sin leer más reciente.
              Léela antes de reactivar.
            </Alert>
          )}
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
            tagFolders={tagFolders}
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
              key={selectedConversation.id}
              conversation={selectedConversation}
              phoneNumberId={activePhoneNumberId}
              wabaId={activeWabaId}
              headerDisplayName={contactCtx.displayName ?? ''}
              headerPhotoUrl={contactCtx.photoUrl}
              onToggleContactPanel={handleToggleContactPanel}
              contactPanelOpen={rightPanel === 'contact'}
              templatesPanelOpen={rightPanel === 'templates'}
              onToggleTemplatesPanel={handleToggleTemplatesPanel}
              externalDraft={composerDraft}
              onExternalDraftConsumed={() => setComposerDraft('')}
              tags={tags}
              tagFolders={tagFolders}
              onTagsChanged={loadTags}
              onManageTags={() => setTagManagerOpen(true)}
              onConversationPermanentlyDeleted={handleConversationPermanentlyDeleted}
              snippets={snippets}
              myUid={myUid}
              myDisplayName={myDisplayName}
              peerPresences={peersInSelectedChat}
              onLoadedConversationInbound={setLoadedConversationInbound}
            />
          ) : (
            <WhatsAppEmptyState />
          )}
        </Box>

        {showRightColumn && selectedConversation && rightPanel === 'templates' && canShowTemplates && activeWabaId && activePhoneNumberId && (
          <TemplatesSidePanel
            wabaId={activeWabaId}
            phoneNumberId={activePhoneNumberId}
            recipientPhone={recipientPhoneForTemplates}
            onApplyDraftToComposer={setComposerDraft}
            snippets={snippets}
            onSnippetsChanged={loadSnippets}
            conversationStableKey={selectedConversation.id}
            conversationDisplayName={contactCtx.displayName ?? undefined}
            lastInboundAt={templateLastInboundAt}
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

      <NewContactDialog
        open={newContactOpen}
        onClose={() => setNewContactOpen(false)}
        phoneNumberId={listPhoneNumberId || botPhoneNumberId}
        onCreated={handleContactCreated}
      />

      <TagManagerDialog
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        tags={tags}
        folders={tagFolders}
        tagCounts={inboxMetrics.tagCountsById}
        onTagsChanged={loadTags}
      />

      <OutOfCoverageTagsDialog
        open={outOfCoverageDialogOpen}
        onClose={() => setOutOfCoverageDialogOpen(false)}
        tags={tags}
        folders={tagFolders}
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
