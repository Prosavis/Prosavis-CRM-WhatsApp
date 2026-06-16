import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Chip,
  Tooltip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Snackbar,
  Alert,
  Popover,
  TextField,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Checkbox,
  FormControlLabel,
  Switch,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import BlockIcon from '@mui/icons-material/Block';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DeleteForeverOutlinedIcon from '@mui/icons-material/DeleteForeverOutlined';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import ArchiveIcon from '@mui/icons-material/Archive';
import UnarchiveIcon from '@mui/icons-material/Unarchive';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import MarkChatUnreadIcon from '@mui/icons-material/MarkChatUnread';
import ReplyIcon from '@mui/icons-material/Reply';
import ForwardIcon from '@mui/icons-material/Forward';
import MessageBubble, { type MessageReaction } from './MessageBubble';
import ForwardMessageDialog from './ForwardMessageDialog';
import MessageInput, {
  type PendingAttachmentForSend,
  type PendingAttachmentStatus,
} from './MessageInput';
import { uploadWhatsAppStorageFile } from '@/services/storageService';
import {
  subscribeToMessages,
  sendMessage,
  sendMedia,
  sendMediaBatch,
  sendReaction,
  markAsRead,
  patchWhatsAppConversationAdmin,
  suggestWhatsAppAgentReply,
  getWhatsAppBookingContext,
  deleteWhatsAppMessages,
  deleteWhatsAppConversationPermanently,
  DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE,
  blockWhatsAppUser,
  assignWhatsAppTags,
  setMyWhatsAppPresence,
  clearMyWhatsAppPresence,
  listWhatsAppStickers,
  createWhatsAppSticker,
  type WhatsAppConversation,
  type WhatsAppMessage,
  type WhatsAppTag,
  type WhatsAppSnippet,
  type WhatsAppMediaBatchAttachment,
  type BookingContextData,
  type WhatsAppAdminPresence,
  type WhatsAppSticker,
} from '@/services/whatsappService';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import BookingAssistantDrawer from './BookingAssistantDrawer';
import type { ForwardWhatsAppResult } from '@/services/forwardWhatsAppMessage';
import { isForwardableMessage } from '@/services/forwardWhatsAppMessage';
import { ContactAvatar } from '@/components/common/ContactAvatar';
import { pickContactPhotoUrl } from '@/utils/contactAvatar';
import { getLastInboundAt } from '@/utils/whatsappTemplateSuggestions';

interface ChatAreaProps {
  conversation: WhatsAppConversation;
  phoneNumberId?: string;
  wabaId?: string;
  headerDisplayName: string;
  headerPhotoUrl?: string;
  onToggleContactPanel: () => void;
  contactPanelOpen: boolean;
  templatesPanelOpen: boolean;
  onToggleTemplatesPanel: () => void;
  externalDraft?: string;
  onExternalDraftConsumed?: () => void;
  tags?: WhatsAppTag[];
  onTagsChanged?: () => void;
  /** Abre el diálogo de gestión de tags (crear, editar, eliminar). */
  onManageTags?: () => void;
  onConversationPermanentlyDeleted?: () => void;
  snippets?: WhatsAppSnippet[];
  /** Uid del admin actual (para escribir su doc de presencia). */
  myUid?: string | null;
  /** Nombre que verán los demás admins en los indicadores de presencia. */
  myDisplayName?: string;
  /** Otros admins (excluye al usuario actual) actualmente activos en este chat. */
  peerPresences?: WhatsAppAdminPresence[];
}

/** Resumen humano para el banner del chat: prioriza "escribiendo" sobre "viendo". */
function summarizePeerPresencesForBanner(peers: WhatsAppAdminPresence[]): {
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
  const verb = viewing.length === 1 ? 'está viendo este chat' : 'están viendo este chat';
  return { text: `${formatNames(viewing)} ${verb}`, typing: false };
}

function groupMessagesByDate(messages: WhatsAppMessage[]): Map<string, WhatsAppMessage[]> {
  const groups = new Map<string, WhatsAppMessage[]>();
  for (const msg of messages) {
    const dateKey = msg.createdAt.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey)!.push(msg);
  }
  return groups;
}

function reactionActorKey(message: Pick<WhatsAppMessage, 'direction' | 'agentUid' | 'senderType'>): string {
  if (message.direction === 'inbound') return 'customer';
  return `agent:${message.agentUid || message.senderType || 'agent'}`;
}

function deriveReactionsByTarget(
  messages: WhatsAppMessage[],
  pendingReactions: Record<string, { emoji: string; actorKey: string }>,
): Map<string, MessageReaction[]> {
  const byTarget = new Map<string, Map<string, MessageReaction>>();
  const reactionEvents = messages
    .filter((message) => message.reactionTo)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  for (const message of reactionEvents) {
    const target = message.reactionTo!;
    const actorKey = reactionActorKey(message);
    const actorMap = byTarget.get(target) || new Map<string, MessageReaction>();
    if (message.reactionRemoved || !message.messageBody?.trim()) {
      actorMap.delete(actorKey);
    } else {
      actorMap.set(actorKey, {
        actorKey,
        emoji: message.messageBody,
        direction: message.direction,
      });
    }
    byTarget.set(target, actorMap);
  }

  for (const [target, pending] of Object.entries(pendingReactions)) {
    const actorMap = byTarget.get(target) || new Map<string, MessageReaction>();
    if (!pending.emoji.trim()) {
      actorMap.delete(pending.actorKey);
    } else {
      actorMap.set(pending.actorKey, {
        actorKey: pending.actorKey,
        emoji: pending.emoji,
        direction: 'outbound',
        pending: true,
      });
    }
    byTarget.set(target, actorMap);
  }

  return new Map(
    [...byTarget.entries()].map(([target, actorMap]) => [
      target,
      [...actorMap.values()].filter((reaction) => reaction.emoji.trim()),
    ]),
  );
}

async function detectAnimatedWebp(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  for (let i = 0; i <= bytes.length - 4; i += 1) {
    if (
      bytes[i] === 0x41 &&
      bytes[i + 1] === 0x4e &&
      bytes[i + 2] === 0x49 &&
      bytes[i + 3] === 0x4d
    ) {
      return true;
    }
  }
  return false;
}

const ChatArea: React.FC<ChatAreaProps> = ({
  conversation,
  phoneNumberId,
  wabaId,
  headerDisplayName,
  headerPhotoUrl,
  onToggleContactPanel,
  contactPanelOpen,
  templatesPanelOpen,
  onToggleTemplatesPanel,
  externalDraft,
  onExternalDraftConsumed,
  tags = [],
  onTagsChanged,
  onManageTags,
  onConversationPermanentlyDeleted,
  snippets,
  myUid,
  myDisplayName,
  peerPresences = [],
}) => {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggestionDraft, setSuggestionDraft] = useState('');
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [suggestionHint, setSuggestionHint] = useState<string | null>(null);
  const [aiContextDialogOpen, setAiContextDialogOpen] = useState(false);
  const [aiExtraContext, setAiExtraContext] = useState('');
  const [bookingContext, setBookingContext] = useState<BookingContextData | null>(null);
  const [bookingDrawerOpen, setBookingDrawerOpen] = useState(false);
  const [bookingContextLoading, setBookingContextLoading] = useState(false);
  const [wompiCheckoutUrl, setWompiCheckoutUrl] = useState<string | null>(null);
  const [wompiPaymentReference, setWompiPaymentReference] = useState<string | null>(null);
  const [wompiAmountCOP, setWompiAmountCOP] = useState<number | null>(null);
  const [bookingCheckoutSyncEpoch, setBookingCheckoutSyncEpoch] = useState(0);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [messagesToForward, setMessagesToForward] = useState<WhatsAppMessage[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({ open: false, message: '', severity: 'success' });

  const [tagAnchor, setTagAnchor] = useState<HTMLElement | null>(null);
  const [tagSaving, setTagSaving] = useState(false);
  const [deleteConversationOpen, setDeleteConversationOpen] = useState(false);
  const [deleteConversationPhrase, setDeleteConversationPhrase] = useState('');
  const [deleteConversationLoading, setDeleteConversationLoading] = useState(false);
  const [deleteBlockUser, setDeleteBlockUser] = useState(true);
  const [deleteLeadsFlag, setDeleteLeadsFlag] = useState(true);
  const [blockOnlyLoading, setBlockOnlyLoading] = useState(false);

  const [replyToMessage, setReplyToMessage] = useState<WhatsAppMessage | null>(null);
  const [pendingReactions, setPendingReactions] = useState<Record<string, { emoji: string; actorKey: string }>>({});
  const reactionTimersRef = useRef<Record<string, number>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const stableKey = conversation.phone || conversation.id;
  const voiceTranscriptionStorageKey = `wa-include-voice-transcriptions:${phoneNumberId || 'default'}:${myUid || 'admin'}`;
  const [includeVoiceTranscriptions, setIncludeVoiceTranscriptions] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(voiceTranscriptionStorageKey) === 'true';
  });
  const [stickers, setStickers] = useState<WhatsAppSticker[]>([]);
  const [stickersLoading, setStickersLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setSelectionMode(false);
    setSelectedIds(new Set());

    const unsub = subscribeToMessages(
      stableKey,
      (msgs) => {
        setMessages(msgs);
        setLoading(false);
      },
      (error) => {
        console.error('Error en listener de mensajes:', error);
        setLoading(false);
      },
    );

    return () => unsub();
  }, [stableKey]);

  useEffect(() => {
    setSuggestionDraft('');
    setSuggestionHint(null);
    setBookingContext(null);
    setBookingDrawerOpen(false);
    setWompiCheckoutUrl(null);
    setWompiPaymentReference(null);
    setWompiAmountCOP(null);
    setBookingCheckoutSyncEpoch(0);
    setPendingReactions({});
    Object.values(reactionTimersRef.current).forEach((timer) => window.clearTimeout(timer));
    reactionTimersRef.current = {};
  }, [stableKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(voiceTranscriptionStorageKey);
    setIncludeVoiceTranscriptions(stored === 'true');
  }, [voiceTranscriptionStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      voiceTranscriptionStorageKey,
      includeVoiceTranscriptions ? 'true' : 'false',
    );
  }, [includeVoiceTranscriptions, voiceTranscriptionStorageKey]);

  const loadStickers = useCallback(async () => {
    setStickersLoading(true);
    try {
      setStickers(await listWhatsAppStickers());
    } catch (err) {
      console.warn('WhatsApp stickers library is unavailable:', err);
      setStickers([]);
    } finally {
      setStickersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStickers();
  }, [loadStickers]);

  useEffect(() => {
    if (externalDraft) {
      setSuggestionDraft(externalDraft);
      onExternalDraftConsumed?.();
    }
  }, [externalDraft, onExternalDraftConsumed]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // === Presencia: marcar "viendo" al entrar / cambiar de chat + heartbeat ===
  // `currentActivityRef` mantiene la última actividad anunciada para que el heartbeat
  // refresque el `updatedAt` con el mismo estado (típicamente 'viewing' salvo cuando
  // el compositor está en modo 'typing').
  const currentActivityRef = useRef<'viewing' | 'typing'>('viewing');

  useEffect(() => {
    if (!myUid || !phoneNumberId) return;
    currentActivityRef.current = 'viewing';
    void setMyWhatsAppPresence(myUid, {
      phoneNumberId,
      conversationId: conversation.id,
      displayName: myDisplayName || 'Administrador',
      activity: 'viewing',
    });

    const heartbeat = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void setMyWhatsAppPresence(myUid, {
        phoneNumberId,
        conversationId: conversation.id,
        displayName: myDisplayName || 'Administrador',
        activity: currentActivityRef.current,
      });
    }, 15_000);

    return () => {
      window.clearInterval(heartbeat);
      if (myUid) void clearMyWhatsAppPresence(myUid);
    };
  }, [conversation.id, myUid, myDisplayName, phoneNumberId]);

  const handleTypingChange = useCallback(
    (isTyping: boolean) => {
      if (!myUid || !phoneNumberId) return;
      const next: 'viewing' | 'typing' = isTyping ? 'typing' : 'viewing';
      if (currentActivityRef.current === next) return;
      currentActivityRef.current = next;
      void setMyWhatsAppPresence(myUid, {
        phoneNumberId,
        conversationId: conversation.id,
        displayName: myDisplayName || 'Administrador',
        activity: next,
      });
    },
    [conversation.id, myUid, myDisplayName, phoneNumberId],
  );

  const peerBanner = useMemo(
    () => summarizePeerPresencesForBanner(peerPresences),
    [peerPresences],
  );

  useEffect(() => {
    if ((conversation.unreadCount > 0 || conversation.crmForceUnread) && messages.length > 0) {
      const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound');
      if (conversation.unreadCount > 0) {
        // Si hay waMessageId real -> también enviamos read receipt a Meta.
        // Si no (p.ej. stubs de recuperación), igual reseteamos `unreadCount`
        // pasando solo `conversationKey`.
        markAsRead(lastInbound?.waMessageId, conversation.id, phoneNumberId).catch(() => {});
      } else if (conversation.crmForceUnread) {
        patchWhatsAppConversationAdmin({
          conversationId: conversation.id,
          patch: { crmForceUnread: false },
        }).catch(() => {});
      }
    }
  }, [
    conversation.id,
    conversation.unreadCount,
    conversation.crmForceUnread,
    messages,
    phoneNumberId,
  ]);

  const handleSend = useCallback(
    async (text: string) => {
      const replyId = replyToMessage?.waMessageId;
      setReplyToMessage(null);
      await sendMessage(stableKey, text, phoneNumberId, replyId);
    },
    [stableKey, phoneNumberId, replyToMessage],
  );

  const handleSendMedia = useCallback(
    async (
      file: File,
      mediaType: 'image' | 'audio' | 'video' | 'document',
      caption?: string,
    ) => {
      // Sanitiza el nombre para Storage: sin espacios ni caracteres conflictivos en URL.
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const storagePath = `${Date.now()}_${safeName}`;
      const { publicUrl: url } = await uploadWhatsAppStorageFile(
        'whatsapp-media',
        storagePath,
        file,
      );

      const replyId = replyToMessage?.waMessageId;
      setReplyToMessage(null);

      // La URL pública se usa como fallback; la Edge Function crea su propio signed URL
      // desde storagePath usando service_role, por lo que incluso si url está vacío funciona.
      await sendMedia(stableKey, mediaType, url || `wa://${storagePath}`, {
        caption,
        storagePath,
        mimeType: file.type || undefined,
        sizeBytes: file.size,
        ...(mediaType === 'document' ? { filename: file.name } : {}),
        ...(phoneNumberId ? { phoneNumberId } : {}),
        ...(replyId ? { replyToWaMessageId: replyId } : {}),
      });
    },
    [stableKey, phoneNumberId, replyToMessage],
  );

  const handleUploadSticker = useCallback(async (file: File) => {
    const isWebp = file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp');
    if (!isWebp) {
      throw new Error('Solo se permiten stickers .webp');
    }
    const isAnimated = await detectAnimatedWebp(file);
    const maxBytes = isAnimated ? 500 * 1024 : 100 * 1024;
    if (file.size > maxBytes) {
      throw new Error(isAnimated ? 'El sticker animado supera 500 KB' : 'El sticker estático supera 100 KB');
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, '_');
    const storagePath = `whatsapp-stickers/${Date.now()}_${safeName}`;
    const objectPath = storagePath.replace(/^whatsapp-stickers\//, '');
    const { publicUrl: downloadUrl } = await uploadWhatsAppStorageFile(
      'whatsapp-stickers',
      objectPath,
      file,
    );
    await createWhatsAppSticker({
      name: file.name.replace(/\.webp$/i, '').slice(0, 80) || 'Sticker',
      storagePath,
      downloadUrl,
      mimeType: 'image/webp',
      sizeBytes: file.size,
      isAnimated,
    });
    await loadStickers();
  }, [loadStickers]);

  const handleSendSticker = useCallback(async (sticker: WhatsAppSticker) => {
    const replyId = replyToMessage?.waMessageId;
    setReplyToMessage(null);
    await sendMedia(stableKey, 'sticker', sticker.downloadUrl, {
      ...(phoneNumberId ? { phoneNumberId } : {}),
      ...(replyId ? { replyToWaMessageId: replyId } : {}),
      storagePath: sticker.storagePath,
      mimeType: sticker.mimeType,
      sizeBytes: sticker.sizeBytes,
      isAnimatedSticker: sticker.isAnimated === true,
    });
  }, [phoneNumberId, replyToMessage, stableKey]);

  const handleSendMediaBatch = useCallback(
    async (
      attachments: PendingAttachmentForSend[],
      caption: string | undefined,
      onStatusChange: (id: string, status: PendingAttachmentStatus, error?: string) => void,
    ): Promise<{ failedClientAttachmentIds: string[] }> => {
      const clientBatchId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? `wa_${crypto.randomUUID()}`
          : `wa_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const uploaded: WhatsAppMediaBatchAttachment[] = [];
      for (const [index, attachment] of attachments.entries()) {
        try {
          onStatusChange(attachment.id, 'uploading');
          const safeName = attachment.file.name.replace(/[^\w.\-]+/g, '_');
          const storagePath = `${clientBatchId}/${index}_${safeName}`;
          const { publicUrl: mediaUrl } = await uploadWhatsAppStorageFile(
            'whatsapp-media',
            storagePath,
            attachment.file,
          );
          onStatusChange(attachment.id, 'uploaded');
          uploaded.push({
            clientAttachmentId: attachment.id,
            mediaType: attachment.mediaType,
            // La edge function crea su propio signed URL desde storagePath con service_role.
            // mediaUrl se pasa como fallback por si storagePath no está disponible.
            mediaUrl: mediaUrl || `wa://${storagePath}`,
            storagePath,
            filename: attachment.mediaType === 'document' ? attachment.file.name : undefined,
            mimeType: attachment.file.type || undefined,
            sizeBytes: attachment.file.size,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'No se pudo subir el archivo';
          onStatusChange(attachment.id, 'failed', message);
        }
      }

      if (uploaded.length === 0) {
        throw new Error('No se pudo subir ningún adjunto.');
      }

      uploaded.forEach((item) => onStatusChange(item.clientAttachmentId, 'sending'));
      const replyId = replyToMessage?.waMessageId;
      setReplyToMessage(null);

      const result = await sendMediaBatch({
        to: stableKey,
        phoneNumberId,
        caption,
        replyToWaMessageId: replyId,
        clientBatchId,
        attachments: uploaded,
      });

      const failedIds = new Set<string>();
      for (const item of result.results) {
        if (!item.clientAttachmentId) continue;
        if (item.success) {
          onStatusChange(item.clientAttachmentId, 'sent');
        } else {
          failedIds.add(item.clientAttachmentId);
          onStatusChange(item.clientAttachmentId, 'failed', item.error || 'No se pudo enviar');
        }
      }

      attachments
        .filter((attachment) => !uploaded.some((item) => item.clientAttachmentId === attachment.id))
        .forEach((attachment) => failedIds.add(attachment.id));

      return { failedClientAttachmentIds: [...failedIds] };
    },
    [phoneNumberId, replyToMessage, stableKey],
  );

  const handleRequestSuggestion = useCallback(async (forceGenerate = false, extraContext?: string) => {
    setSuggestionLoading(true);
    setSuggestionHint(null);
    try {
      const result = await suggestWhatsAppAgentReply(
        stableKey,
        forceGenerate,
        includeVoiceTranscriptions,
        extraContext,
      );
      if (result.suggestion) {
        setSuggestionDraft(result.suggestion);
        setSuggestionHint(null);
      } else if (result.lastMessageIsOutbound) {
        setSuggestionHint(result.hint || 'El último mensaje fue tuyo. Espera respuesta del cliente.');
      }
      const nextCtx = result.bookingContext;
      const nextHasAnyData = !!nextCtx && (
        !!nextCtx.collectedData.date ||
        !!nextCtx.collectedData.time ||
        !!nextCtx.collectedData.duration ||
        !!nextCtx.collectedData.address ||
        !!nextCtx.calculatedPrice
      );

      // Si el nuevo contexto trae stage real (no_booking != ignorar) y datos:
      if (nextCtx && nextCtx.stage !== 'no_booking') {
        setBookingContext((prev) => {
          if (!prev) return nextCtx;
          if (nextHasAnyData) return nextCtx;
          const prevHasAnyData =
            !!prev.collectedData.date ||
            !!prev.collectedData.time ||
            !!prev.collectedData.duration ||
            !!prev.collectedData.address ||
            !!prev.calculatedPrice;
          return prevHasAnyData ? prev : nextCtx;
        });

        const haveNewWompi = !!result.wompiCheckoutUrl;
        if (haveNewWompi) {
          setWompiCheckoutUrl(result.wompiCheckoutUrl ?? null);
          setWompiPaymentReference(result.wompiPaymentReference ?? null);
          setWompiAmountCOP(result.wompiAmountCOP ?? null);
        }
        setBookingDrawerOpen(true);
        setBookingCheckoutSyncEpoch((e) => e + 1);
      } else {
        // El nuevo contexto vino vacío / no_booking. Antes limpiábamos todo,
        // pero eso borraba datos válidos cuando el extractor fallaba aleatoriamente.
        // Conservamos `prev` si tenía algo útil; solo limpiamos si NUNCA hubo
        // contexto válido o si el usuario abandonó la intención (sin datos previos).
        setBookingContext((prev) => {
          if (!prev) return null;
          const prevHasAnyData =
            !!prev.collectedData.date ||
            !!prev.collectedData.time ||
            !!prev.collectedData.duration ||
            !!prev.collectedData.address ||
            !!prev.calculatedPrice;
          return prevHasAnyData ? prev : null;
        });
        // Sólo limpiamos el wompi cuando el contexto se limpió (no había datos previos).
        // Si conservamos prev, mantenemos wompi previo intacto.
      }
    } catch (err) {
      console.error('Error requesting AI suggestion:', err);
    } finally {
      setSuggestionLoading(false);
    }
  }, [includeVoiceTranscriptions, stableKey]);

  const handleSuggestionRequestOption = useCallback((options?: { withContext?: boolean }) => {
    if (options?.withContext) {
      setAiExtraContext('');
      setAiContextDialogOpen(true);
      return;
    }
    void handleRequestSuggestion(false);
  }, [handleRequestSuggestion]);

  const handleGenerateWithContext = useCallback(() => {
    const context = aiExtraContext.trim();
    if (!context) return;
    setAiContextDialogOpen(false);
    setAiExtraContext('');
    void handleRequestSuggestion(false, context);
  }, [aiExtraContext, handleRequestSuggestion]);

  const handleOpenBookingAssistant = useCallback(async () => {
    // Si ya tenemos contexto cargado (vía sugerencia de IA o carga previa),
    // simplemente abrimos el drawer sin re-extraer.
    if (bookingContext) {
      setBookingDrawerOpen(true);
      return;
    }

    setBookingContextLoading(true);
    try {
      const result = await getWhatsAppBookingContext(stableKey, includeVoiceTranscriptions);
      if (result.bookingContext) {
        setBookingContext(result.bookingContext);
        if (result.wompiCheckoutUrl) {
          setWompiCheckoutUrl(result.wompiCheckoutUrl);
          setWompiPaymentReference(result.wompiPaymentReference ?? null);
          setWompiAmountCOP(result.wompiAmountCOP ?? null);
        }
        setBookingCheckoutSyncEpoch((e) => e + 1);
        setBookingDrawerOpen(true);
      } else {
        console.warn('No se pudo extraer contexto de booking del chat');
      }
    } catch (err) {
      console.error('Error cargando contexto de booking manualmente:', err);
    } finally {
      setBookingContextLoading(false);
    }
  }, [bookingContext, includeVoiceTranscriptions, stableKey]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDeleteSingle = useCallback((id: string) => {
    setDeleteTargetId(id);
    setDeleteConfirmOpen(true);
  }, []);

  const handleDeleteConfirmed = useCallback(async () => {
    setDeleteConfirmOpen(false);
    setDeleting(true);
    const ids = deleteTargetId ? [deleteTargetId] : Array.from(selectedIds);
    try {
      const result = await deleteWhatsAppMessages(ids, conversation.id);
      setSnack({ open: true, message: `${result.deleted} mensaje(s) eliminado(s)`, severity: 'success' });
      setSelectedIds(new Set());
      setDeleteTargetId(null);
      if (selectionMode && selectedIds.size === ids.length) setSelectionMode(false);
    } catch {
      setSnack({ open: true, message: 'Error al eliminar mensajes', severity: 'error' });
    } finally {
      setDeleting(false);
    }
  }, [deleteTargetId, selectedIds, selectionMode, conversation.id]);

  const handleBulkDelete = useCallback(() => {
    setDeleteTargetId(null);
    setDeleteConfirmOpen(true);
  }, []);

  const handleTagToggle = useCallback(async (tagId: string) => {
    const currentTags = conversation.tagIds || [];
    const isAssigned = currentTags.includes(tagId);
    const newTags = isAssigned
      ? currentTags.filter((id) => id !== tagId)
      : [...currentTags, tagId];

    setTagSaving(true);
    try {
      await assignWhatsAppTags(conversation.id, newTags);
      onTagsChanged?.();
    } catch (err) {
      console.error('Error assigning tags:', err);
      setSnack({ open: true, message: 'Error al asignar tag', severity: 'error' });
    } finally {
      setTagSaving(false);
    }
  }, [conversation.id, conversation.tagIds, onTagsChanged]);

  const handleDeleteConversationConfirmed = useCallback(async () => {
    if (deleteConversationPhrase.trim() !== DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE) {
      setSnack({
        open: true,
        message: 'La frase de confirmación no coincide',
        severity: 'error',
      });
      return;
    }
    setDeleteConversationLoading(true);
    try {
      const result = await deleteWhatsAppConversationPermanently(
        conversation.id,
        DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE,
        {
          blockUser: deleteBlockUser,
          deleteLeads: deleteLeadsFlag,
          phoneNumberId,
        },
      );
      setDeleteConversationOpen(false);
      setDeleteConversationPhrase('');
      const parts = [`${result.messagesDeleted} mensaje(s) eliminado(s)`];
      if (result.leadsDeleted) parts.push(`${result.leadsDeleted} lead(s) eliminado(s)`);
      if (result.metaBlockAttempted) {
        parts.push(result.metaBlockSuccess ? 'bloqueado en Meta' : 'bloqueo Meta falló (bloqueado internamente)');
      }
      setSnack({ open: true, message: parts.join(', '), severity: 'success' });
      onConversationPermanentlyDeleted?.();
    } catch (err) {
      console.error('Error al eliminar conversación:', err);
      setSnack({ open: true, message: 'No se pudo eliminar la conversación', severity: 'error' });
    } finally {
      setDeleteConversationLoading(false);
    }
  }, [conversation.id, deleteConversationPhrase, deleteBlockUser, deleteLeadsFlag, phoneNumberId, onConversationPermanentlyDeleted]);

  const handleBlockOnly = useCallback(async () => {
    setBlockOnlyLoading(true);
    try {
      const result = await blockWhatsAppUser(conversation.id, phoneNumberId);
      const msg = result.metaBlockSuccess
        ? 'Contacto bloqueado en Meta y lista interna'
        : 'Contacto bloqueado internamente (Meta puede no haberse aplicado)';
      setSnack({ open: true, message: msg, severity: 'success' });
      setDeleteConversationOpen(false);
    } catch (err) {
      console.error('Error al bloquear:', err);
      setSnack({ open: true, message: 'No se pudo bloquear al contacto', severity: 'error' });
    } finally {
      setBlockOnlyLoading(false);
    }
  }, [conversation.id, phoneNumberId]);

  const handleArchiveToggle = useCallback(async () => {
    try {
      await patchWhatsAppConversationAdmin({
        conversationId: conversation.id,
        patch: { isArchived: !conversation.isArchived },
      });
      setSnack({ open: true, message: conversation.isArchived ? 'Conversación desarchivada' : 'Conversación archivada', severity: 'success' });
    } catch {
      setSnack({ open: true, message: 'Error al cambiar estado de archivo', severity: 'error' });
    }
  }, [conversation.id, conversation.isArchived]);

  const handlePinToggle = useCallback(async () => {
    try {
      await patchWhatsAppConversationAdmin({
        conversationId: conversation.id,
        patch: { isPinned: !conversation.isPinned },
      });
    } catch {
      setSnack({ open: true, message: 'Error al fijar/desfijar', severity: 'error' });
    }
  }, [conversation.id, conversation.isPinned]);

  const handleMarkUnread = useCallback(async () => {
    try {
      await patchWhatsAppConversationAdmin({
        conversationId: conversation.id,
        patch: { crmForceUnread: !conversation.crmForceUnread },
      });
    } catch {
      setSnack({ open: true, message: 'Error al marcar como no leído', severity: 'error' });
    }
  }, [conversation.id, conversation.crmForceUnread]);

  const handleReply = useCallback((msg: WhatsAppMessage) => {
    setReplyToMessage(msg);
  }, []);

  const handleForwardSingle = useCallback((msg: WhatsAppMessage) => {
    setMessagesToForward([msg]);
    setForwardDialogOpen(true);
  }, []);

  const handleForwardBulk = useCallback(() => {
    const selected = messages
      .filter((msg) => selectedIds.has(msg.id))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const forwardable = selected.filter(isForwardableMessage);
    if (forwardable.length === 0) {
      setSnack({
        open: true,
        message: 'Ninguno de los mensajes seleccionados se puede reenviar',
        severity: 'error',
      });
      return;
    }
    setMessagesToForward(forwardable);
    setForwardDialogOpen(true);
  }, [messages, selectedIds]);

  const handleForwarded = useCallback((result: ForwardWhatsAppResult) => {
    if (result.sent > 0) {
      const skippedNote = result.skipped > 0 ? ` (${result.skipped} omitido(s))` : '';
      const failedNote = result.failed > 0 ? ` · ${result.failed} fallido(s)` : '';
      setSnack({
        open: true,
        message: `${result.sent} mensaje(s) reenviado(s)${skippedNote}${failedNote}`,
        severity: result.failed > 0 ? 'error' : 'success',
      });
      if (result.failed === 0) {
        setSelectionMode(false);
        setSelectedIds(new Set());
        setForwardDialogOpen(false);
        setMessagesToForward([]);
      }
    }
  }, []);

  const handleCloseForwardDialog = useCallback(() => {
    setForwardDialogOpen(false);
    setMessagesToForward([]);
  }, []);

  const handleReact = useCallback((msg: WhatsAppMessage, emoji: string) => {
    if (!msg.waMessageId) {
      setSnack({ open: true, message: 'Este mensaje no tiene ID de WhatsApp para reaccionar', severity: 'error' });
      return;
    }

    const targetWaMessageId = msg.waMessageId;
    const actorKey = `agent:${myUid || 'current'}`;
    setPendingReactions((prev) => ({
      ...prev,
      [targetWaMessageId]: { emoji, actorKey },
    }));

    if (reactionTimersRef.current[targetWaMessageId]) {
      window.clearTimeout(reactionTimersRef.current[targetWaMessageId]);
    }

    const clientRequestId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `reaction_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    reactionTimersRef.current[targetWaMessageId] = window.setTimeout(async () => {
      delete reactionTimersRef.current[targetWaMessageId];
      try {
        await sendReaction({
          to: stableKey,
          reactToWaMessageId: targetWaMessageId,
          emoji,
          phoneNumberId,
          clientRequestId,
        });
        setPendingReactions((prev) => {
          const next = { ...prev };
          delete next[targetWaMessageId];
          return next;
        });
      } catch (err) {
        const msgText = err instanceof Error ? err.message : 'No se pudo enviar la reacción';
        setPendingReactions((prev) => {
          const next = { ...prev };
          delete next[targetWaMessageId];
          return next;
        });
        setSnack({ open: true, message: msgText, severity: 'error' });
      }
    }, 500);
  }, [myUid, phoneNumberId, stableKey]);

  const visibleMessages = useMemo(
    () => messages.filter((message) => !message.reactionTo),
    [messages],
  );
  const lastInboundAt = useMemo(() => getLastInboundAt(visibleMessages), [visibleMessages]);
  const pendingInboundAudioCount = useMemo(
    () =>
      visibleMessages.filter(
        (message) =>
          message.direction === 'inbound' &&
          message.mediaType === 'audio' &&
          message.voiceTranscriptionStatus !== 'completed',
      ).length,
    [visibleMessages],
  );
  const reactionsByTarget = useMemo(
    () => deriveReactionsByTarget(messages, pendingReactions),
    [messages, pendingReactions],
  );
  const currentAgentReactionByTarget = useMemo(() => {
    const actorKey = `agent:${myUid || 'current'}`;
    const map = new Map<string, string>();
    for (const [target, reactions] of reactionsByTarget) {
      const reaction = reactions.find((item) => item.actorKey === actorKey);
      if (reaction) map.set(target, reaction.emoji);
    }
    return map;
  }, [myUid, reactionsByTarget]);

  const groupedMessages = groupMessagesByDate(visibleMessages);
  const displayName =
    headerDisplayName ||
    conversation.contactName ||
    conversation.contactPhone ||
    conversation.phone ||
    conversation.id;

  const deleteCount = deleteTargetId ? 1 : selectedIds.size;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 2,
          py: 1,
          bgcolor: (t) =>
            t.palette.mode === 'dark' ? alpha(t.palette.common.white, 0.06) : '#f0f2f5',
          borderBottom: 1,
          borderColor: 'divider',
          gap: 1.5,
        }}
      >
        {selectionMode ? (
          <>
            <IconButton size="small" onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}>
              <CloseIcon />
            </IconButton>
            <Typography variant="subtitle2" sx={{ flex: 1 }}>
              {selectedIds.size} seleccionado(s)
            </Typography>
            <Button
              size="small"
              startIcon={<ForwardIcon />}
              disabled={selectedIds.size === 0}
              onClick={handleForwardBulk}
            >
              Reenviar
            </Button>
            <Button
              size="small"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              disabled={selectedIds.size === 0 || deleting}
              onClick={handleBulkDelete}
            >
              Eliminar
            </Button>
          </>
        ) : (
          <>
            <ContactAvatar
              displayName={displayName}
              phone={conversation.contactPhone || conversation.phone}
              photoUrl={pickContactPhotoUrl(headerPhotoUrl, conversation.contactPhotoUrl)}
              size={40}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={600} noWrap>{displayName}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {conversation.contactPhone || conversation.phone || ''}
                </Typography>
                {(conversation.tagIds || []).map((tagId) => {
                  const tag = tags.find((t) => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <Chip
                      key={tag.id}
                      label={tag.name}
                      size="small"
                      sx={{ height: 18, fontSize: '0.65rem', bgcolor: tag.color || '#1976d2', color: '#fff' }}
                    />
                  );
                })}
              </Box>
            </Box>
            <Tooltip title="Tags">
              <IconButton
                size="small"
                onClick={(e) => setTagAnchor(e.currentTarget)}
                color={(conversation.tagIds?.length ?? 0) > 0 ? 'primary' : 'default'}
              >
                <LocalOfferIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Seleccionar mensajes">
              <IconButton size="small" onClick={() => setSelectionMode(true)}>
                <CheckBoxOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={conversation.isArchived ? 'Desarchivar' : 'Archivar'}>
              <IconButton size="small" onClick={handleArchiveToggle}>
                {conversation.isArchived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title={conversation.isPinned ? 'Desfijar' : 'Fijar arriba'}>
              <IconButton size="small" onClick={handlePinToggle} color={conversation.isPinned ? 'primary' : 'default'}>
                {conversation.isPinned ? <PushPinIcon fontSize="small" /> : <PushPinOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title={conversation.crmForceUnread ? 'Marcar como leído' : 'Marcar como no leído'}>
              <IconButton size="small" onClick={handleMarkUnread} color={conversation.crmForceUnread ? 'primary' : 'default'}>
                <MarkChatUnreadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Eliminar conversación de la base de datos (spam)">
              <IconButton
                size="small"
                color="error"
                onClick={() => {
                  setDeleteConversationPhrase('');
                  setDeleteConversationOpen(true);
                }}
              >
                <DeleteForeverOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Tooltip title="Ficha del cliente">
              <IconButton size="small" onClick={onToggleContactPanel} color={contactPanelOpen ? 'primary' : 'default'}>
                <InfoOutlinedIcon />
              </IconButton>
            </Tooltip>
            <Tooltip
              title={
                bookingContextLoading
                  ? 'Cargando contexto de booking…'
                  : bookingContext && bookingContext.stage !== 'no_booking'
                    ? 'Asistente de booking'
                    : 'Abrir asistente de booking (extrae datos del chat)'
              }
            >
              <span>
                <IconButton
                  size="small"
                  onClick={handleOpenBookingAssistant}
                  disabled={bookingContextLoading}
                  color={bookingDrawerOpen ? 'primary' : 'default'}
                >
                  {bookingContextLoading ? (
                    <CircularProgress size={18} />
                  ) : (
                    <CalendarMonthIcon />
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Plantillas">
              <IconButton size="small" onClick={onToggleTemplatesPanel} color={templatesPanelOpen ? 'primary' : 'default'}>
                <DescriptionOutlinedIcon />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>

      {/* Banner de presencia: otros admins activos en este chat */}
      {peerBanner && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 2,
            py: 0.5,
            bgcolor: (t) =>
              peerBanner.typing
                ? alpha(t.palette.success.main, t.palette.mode === 'dark' ? 0.18 : 0.12)
                : alpha(t.palette.info.main, t.palette.mode === 'dark' ? 0.18 : 0.1),
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          {peerBanner.typing ? (
            <EditIcon sx={{ fontSize: 14, color: 'success.main' }} />
          ) : (
            <VisibilityIcon sx={{ fontSize: 14, color: 'info.main' }} />
          )}
          <Typography
            variant="caption"
            sx={{
              fontWeight: 500,
              color: peerBanner.typing ? 'success.main' : 'info.main',
            }}
          >
            {peerBanner.text}
          </Typography>
        </Box>
      )}

      {/* Messages */}
      <Box
        ref={scrollContainerRef}
        sx={{
          flex: 1,
          overflow: 'auto',
          bgcolor: (t) => (t.palette.mode === 'dark' ? 'background.default' : '#efeae2'),
          backgroundImage: (t) =>
            t.palette.mode === 'dark'
              ? undefined
              : 'url("data:image/svg+xml,%3Csvg width=\'300\' height=\'300\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence baseFrequency=\'0.65\' stitchTiles=\'stitch\' type=\'fractalNoise\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'0.03\'/%3E%3C/svg%3E")',
          py: 1,
        }}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : visibleMessages.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <Typography variant="body2" color="text.secondary">No hay mensajes en esta conversación</Typography>
          </Box>
        ) : (
          Array.from(groupedMessages.entries()).map(([dateLabel, dayMessages]) => (
            <React.Fragment key={dateLabel}>
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 1 }}>
                <Chip
                  label={dateLabel}
                  size="small"
                  sx={{
                    bgcolor: (t) =>
                      t.palette.mode === 'dark' ? alpha(t.palette.info.main, 0.2) : '#e1f2fb',
                    color: 'text.secondary',
                    fontWeight: 500,
                    fontSize: '0.75rem',
                  }}
                />
              </Box>
              {dayMessages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  allMessages={messages}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(msg.id)}
                  onToggleSelect={handleToggleSelect}
                  onDelete={handleDeleteSingle}
                  onReply={handleReply}
                  onForward={handleForwardSingle}
                  reactions={msg.waMessageId ? reactionsByTarget.get(msg.waMessageId) || [] : []}
                  currentAgentReactionEmoji={msg.waMessageId ? currentAgentReactionByTarget.get(msg.waMessageId) : undefined}
                  reacting={msg.waMessageId ? Boolean(pendingReactions[msg.waMessageId]) : false}
                  onReact={handleReact}
                />
              ))}
            </React.Fragment>
          ))
        )}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      {!selectionMode && (
        <>
          <Box
            sx={{
              px: 2,
              py: 0.75,
              bgcolor: (t) =>
                t.palette.mode === 'dark' ? alpha(t.palette.common.white, 0.04) : '#f8fafc',
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={includeVoiceTranscriptions}
                  onChange={(event) => setIncludeVoiceTranscriptions(event.target.checked)}
                />
              }
              label={
                <Typography variant="caption">
                  Incluir transcripciones en IA
                </Typography>
              }
              sx={{ m: 0 }}
            />
            {includeVoiceTranscriptions && pendingInboundAudioCount > 0 && (
              <Alert severity="warning" sx={{ mt: 0.75, py: 0 }}>
                Hay {pendingInboundAudioCount} audio(s) sin transcribir. No se usarán en la IA hasta transcribirlos.
              </Alert>
            )}
          </Box>
          {replyToMessage && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                px: 2,
                py: 0.75,
                bgcolor: (t) =>
                  t.palette.mode === 'dark' ? alpha(t.palette.common.white, 0.06) : '#f0f2f5',
                borderLeft: '4px solid',
                borderLeftColor: 'success.main',
                gap: 1,
              }}
            >
              <ReplyIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" fontWeight={600} color="primary">
                  {replyToMessage.direction === 'inbound' ? 'Cliente' : 'Tú'}
                </Typography>
                <Typography variant="body2" noWrap color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                  {replyToMessage.messageBody || replyToMessage.caption || `[${replyToMessage.mediaType || 'media'}]`}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => setReplyToMessage(null)}>
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          )}
          <MessageInput
            conversationKey={stableKey}
            onSend={handleSend}
            onSendMedia={handleSendMedia}
            onSendMediaBatch={handleSendMediaBatch}
            draftText={suggestionDraft}
            onRequestSuggestion={handleSuggestionRequestOption}
            suggestionLoading={suggestionLoading}
            suggestionHint={suggestionHint}
            onForceGenerate={() => void handleRequestSuggestion(true)}
            onDismissHint={() => setSuggestionHint(null)}
            snippets={snippets}
            onTypingChange={handleTypingChange}
            stickers={stickers}
            stickersLoading={stickersLoading}
            onRefreshStickers={loadStickers}
            onUploadSticker={handleUploadSticker}
            onSendSticker={handleSendSticker}
          />
        </>
      )}

      {/* Booking Assistant Drawer */}
      {bookingContext && (
        <BookingAssistantDrawer
          open={bookingDrawerOpen}
          onClose={() => setBookingDrawerOpen(false)}
          bookingContext={bookingContext}
          suggestion={suggestionDraft}
          onUseSuggestion={(text) => {
            setSuggestionDraft(text);
            setBookingDrawerOpen(false);
          }}
          wompiCheckoutUrl={wompiCheckoutUrl}
          wompiPaymentReference={wompiPaymentReference}
          wompiAmountCOP={wompiAmountCOP}
          checkoutSyncEpoch={bookingCheckoutSyncEpoch}
          onInsertPaymentLink={(url) => {
            setSuggestionDraft((prev) => {
              if (!prev?.trim()) return url;
              // Si el draft ya contiene un link Wompi (genérico o firmado), lo
              // REEMPLAZAMOS para evitar dejar dos links de pago en el mensaje.
              const wompiRegex = /https?:\/\/checkout\.wompi\.co\/[^\s)]+/gi;
              if (wompiRegex.test(prev)) {
                return prev.replace(wompiRegex, url);
              }
              return `${prev.trim()}\n\n${url}`;
            });
          }}
          wabaId={wabaId}
          phoneNumberId={phoneNumberId}
          recipientPhone={conversation.contactPhone || conversation.phone || stableKey}
          conversationDisplayName={displayName}
          lastInboundAt={lastInboundAt}
          lastMessageDirection={conversation.lastMessageDirection}
        />
      )}

      {/* Tag picker popover */}
      <Popover
        open={Boolean(tagAnchor)}
        anchorEl={tagAnchor}
        onClose={() => setTagAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ minWidth: 220, maxWidth: 300 }}>
          <Typography variant="subtitle2" sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
            Tags de conversación
          </Typography>
          {tags.length === 0 ? (
            <Box sx={{ px: 2, pb: 1.5, pt: 0.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: onManageTags ? 1.5 : 0 }}>
                {onManageTags
                  ? 'Aún no tienes tags. Crea uno para etiquetar este chat y filtrarlo después en la lista.'
                  : 'No hay tags disponibles'}
              </Typography>
              {onManageTags && (
                <Button
                  fullWidth
                  variant="contained"
                  size="small"
                  startIcon={<LocalOfferIcon />}
                  onClick={() => {
                    setTagAnchor(null);
                    onManageTags();
                  }}
                >
                  Crear tag
                </Button>
              )}
            </Box>
          ) : (
            <>
              <List dense sx={{ py: 0 }}>
                {tags.map((tag) => {
                  const isAssigned = (conversation.tagIds || []).includes(tag.id);
                  return (
                    <ListItemButton
                      key={tag.id}
                      onClick={() => handleTagToggle(tag.id)}
                      disabled={tagSaving}
                      dense
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Checkbox
                          edge="start"
                          checked={isAssigned}
                          tabIndex={-1}
                          disableRipple
                          size="small"
                        />
                      </ListItemIcon>
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
                      <ListItemText primary={tag.name} primaryTypographyProps={{ variant: 'body2' }} />
                    </ListItemButton>
                  );
                })}
              </List>
              {onManageTags && (
                <>
                  <Divider />
                  <Box sx={{ px: 1, py: 0.5 }}>
                    <Button
                      fullWidth
                      size="small"
                      onClick={() => {
                        setTagAnchor(null);
                        onManageTags();
                      }}
                    >
                      Gestionar tags
                    </Button>
                  </Box>
                </>
              )}
            </>
          )}
        </Box>
      </Popover>

      {/* Delete confirm dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Eliminar mensaje{deleteCount > 1 ? 's' : ''}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteCount === 1
              ? 'El mensaje se ocultará del CRM. No se eliminará del teléfono del cliente.'
              : `Se ocultarán ${deleteCount} mensajes del CRM. No se eliminarán del teléfono del cliente.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirmed} disabled={deleting}>
            {deleting ? <CircularProgress size={20} /> : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={aiContextDialogOpen}
        onClose={() => !suggestionLoading && setAiContextDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Generar respuesta con contexto</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Agrega instrucciones o intención extra para que la IA ajuste la respuesta al mensaje que quieres enviar.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={4}
            maxRows={8}
            label="Contexto adicional"
            placeholder="Ej. Recuérdale al cliente que tenemos disponibilidad mañana en la tarde y ofrece cerrar la reserva."
            value={aiExtraContext}
            disabled={suggestionLoading}
            onChange={(event) => setAiExtraContext(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                handleGenerateWithContext();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAiContextDialogOpen(false)} disabled={suggestionLoading}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleGenerateWithContext}
            disabled={suggestionLoading || !aiExtraContext.trim()}
            sx={{
              bgcolor: '#7c3aed',
              '&:hover': { bgcolor: '#6d28d9' },
            }}
          >
            {suggestionLoading ? <CircularProgress size={20} /> : 'Generar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={deleteConversationOpen}
        onClose={() => !deleteConversationLoading && setDeleteConversationOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Eliminar conversación permanentemente</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Se borrará el hilo de la lista y se eliminarán de Firestore todos los mensajes asociados a este contacto
            (incluidos adjuntos en Storage cuando apliquen). No borra el chat en el teléfono del usuario. Esta acción no
            se puede deshacer.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Confirmación"
            placeholder={DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE}
            value={deleteConversationPhrase}
            onChange={(e) => setDeleteConversationPhrase(e.target.value)}
            helperText={`Escribe exactamente: ${DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE}`}
            disabled={deleteConversationLoading}
            sx={{ mb: 2 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={deleteBlockUser}
                onChange={(e) => setDeleteBlockUser(e.target.checked)}
                disabled={deleteConversationLoading}
                size="small"
              />
            }
            label={
              <Typography variant="body2">
                Bloquear contacto (lista interna + Meta si aplica)
              </Typography>
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={deleteLeadsFlag}
                onChange={(e) => setDeleteLeadsFlag(e.target.checked)}
                disabled={deleteConversationLoading}
                size="small"
              />
            }
            label={
              <Typography variant="body2">
                Eliminar lead(s) asociados a este teléfono
              </Typography>
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConversationOpen(false)} disabled={deleteConversationLoading || blockOnlyLoading}>
            Cancelar
          </Button>
          <Button
            variant="outlined"
            color="warning"
            startIcon={blockOnlyLoading ? <CircularProgress size={16} /> : <BlockIcon />}
            onClick={handleBlockOnly}
            disabled={deleteConversationLoading || blockOnlyLoading}
          >
            Solo bloquear
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteConversationConfirmed}
            disabled={
              deleteConversationLoading ||
              deleteConversationPhrase.trim() !== DELETE_WHATSAPP_CONVERSATION_CONFIRM_PHRASE
            }
          >
            {deleteConversationLoading ? <CircularProgress size={20} /> : 'Eliminar definitivamente'}
          </Button>
        </DialogActions>
      </Dialog>

      <ForwardMessageDialog
        open={forwardDialogOpen}
        onClose={handleCloseForwardDialog}
        messages={messagesToForward}
        sourceConversationId={conversation.id}
        phoneNumberId={phoneNumberId}
        onForwarded={handleForwarded}
      />

      {/* Snackbar */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))} variant="filled">
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default ChatArea;
