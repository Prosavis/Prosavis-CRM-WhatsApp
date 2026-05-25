import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  CircularProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Chip,
  Paper,
  List,
  ListItemButton,
  Popover,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import SendIcon from '@mui/icons-material/Send';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ImageIcon from '@mui/icons-material/Image';
import AudiotrackIcon from '@mui/icons-material/Audiotrack';
import VideocamIcon from '@mui/icons-material/Videocam';
import DescriptionIcon from '@mui/icons-material/Description';
import CloseIcon from '@mui/icons-material/Close';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import MicIcon from '@mui/icons-material/Mic';
import StopCircleIcon from '@mui/icons-material/StopCircle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS';
import CodeIcon from '@mui/icons-material/Code';
import EmojiEmotionsIcon from '@mui/icons-material/EmojiEmotions';
import StickyNote2Icon from '@mui/icons-material/StickyNote2';
import {
  resolveOutboundMediaSpec,
  type WhatsAppSticker,
  type WhatsAppOutboundMediaType,
  type WhatsAppSnippet,
} from '@/services/whatsappService';
import {
  isVoiceRecorderSupported,
  startVoiceRecording,
  VOICE_NOTE_EXT,
  VOICE_NOTE_MIME,
  type VoiceRecorderHandle,
} from '@/services/voiceRecorder';
import { WhatsAppLexicalEditor, type WhatsAppLexicalEditorHandle } from './lexical/WhatsAppLexicalEditor';

type SupportedMediaType = Extract<
  WhatsAppOutboundMediaType,
  'image' | 'audio' | 'video' | 'document'
>;

export type PendingAttachmentStatus = 'queued' | 'uploading' | 'uploaded' | 'sending' | 'sent' | 'failed';

export interface PendingAttachmentForSend {
  id: string;
  file: File;
  mediaType: SupportedMediaType;
  label: string;
  isRecorded?: boolean;
  audioUrl?: string;
  durationSeconds?: number;
}

interface MessageInputProps {
  onSend: (text: string) => Promise<void>;
  onSendMedia?: (
    file: File,
    mediaType: SupportedMediaType,
    caption?: string,
  ) => Promise<void>;
  onSendMediaBatch?: (
    attachments: PendingAttachmentForSend[],
    caption: string | undefined,
    onStatusChange: (id: string, status: PendingAttachmentStatus, error?: string) => void,
  ) => Promise<{ failedClientAttachmentIds: string[] }>;
  disabled?: boolean;
  draftText?: string;
  onRequestSuggestion?: (options?: { withContext?: boolean }) => void;
  suggestionLoading?: boolean;
  suggestionHint?: string | null;
  onForceGenerate?: () => void;
  onDismissHint?: () => void;
  snippets?: WhatsAppSnippet[];
  /**
   * Notifica al contenedor cuando el usuario empieza/deja de escribir.
   * Se aplica un debounce: 300 ms para `true`, 2.5 s de inactividad para `false`.
   * Al enviar/cancelar/blur también se fuerza `false`.
   */
  onTypingChange?: (isTyping: boolean) => void;
  stickers?: WhatsAppSticker[];
  stickersLoading?: boolean;
  onRefreshStickers?: () => Promise<void> | void;
  onUploadSticker?: (file: File) => Promise<void>;
  onSendSticker?: (sticker: WhatsAppSticker) => Promise<void>;
}

const TYPING_START_DEBOUNCE_MS = 300;
const TYPING_STOP_DEBOUNCE_MS = 2_500;
const COMPOSER_MIN_TEXTAREA_HEIGHT = 72;
const COMPOSER_MAX_TEXTAREA_HEIGHT = 220;
const COMPOSER_VERTICAL_PADDING = 16;

interface PendingFile {
  id: string;
  file: File;
  mediaType: SupportedMediaType;
  preview?: string;
  label: string;
  status: PendingAttachmentStatus;
  error?: string;
  /** True cuando proviene de la grabación in-browser (mostramos UI de audio en lugar del chip). */
  isRecorded?: boolean;
  /** Object URL para reproducir el audio grabado antes de enviarlo. */
  audioUrl?: string;
  durationSeconds?: number;
}

const MENU_ITEMS: Array<{
  key: SupportedMediaType;
  label: string;
  accept: string;
  Icon: React.ElementType;
}> = [
  { key: 'image', label: 'Imagen', accept: 'image/jpeg,image/png', Icon: ImageIcon },
  { key: 'video', label: 'Video', accept: 'video/mp4,video/3gpp', Icon: VideocamIcon },
  { key: 'audio', label: 'Audio', accept: 'audio/*', Icon: AudiotrackIcon },
  {
    key: 'document',
    label: 'Documento',
    accept:
      '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain',
    Icon: DescriptionIcon,
  },
];

const ICON_BY_TYPE: Record<SupportedMediaType, React.ElementType> = {
  image: ImageIcon,
  audio: AudiotrackIcon,
  video: VideocamIcon,
  document: DescriptionIcon,
};

const QUICK_EMOJIS = ['😀', '😊', '🙏', '👍', '❤️', '✨', '✅', '📅', '💳', '🧹', '🏠', '📍'];

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSend,
  onSendMedia,
  onSendMediaBatch,
  disabled,
  draftText,
  onRequestSuggestion,
  suggestionLoading,
  suggestionHint,
  onForceGenerate,
  onDismissHint,
  snippets,
  onTypingChange,
  stickers = [],
  stickersLoading = false,
  onRefreshStickers,
  onUploadSticker,
  onSendSticker,
}) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [snippetHighlight, setSnippetHighlight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(COMPOSER_MIN_TEXTAREA_HEIGHT);
  const [aiAnchorEl, setAiAnchorEl] = useState<null | HTMLElement>(null);
  const [emojiAnchorEl, setEmojiAnchorEl] = useState<null | HTMLElement>(null);
  const [stickerAnchorEl, setStickerAnchorEl] = useState<null | HTMLElement>(null);
  const [stickerUploading, setStickerUploading] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef<VoiceRecorderHandle | null>(null);
  const recordingTimerRef = useRef<number | null>(null);

  const lexicalEditorRef = useRef<WhatsAppLexicalEditorHandle | null>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const fileInputRefs = useRef<Record<SupportedMediaType, HTMLInputElement | null>>({
    image: null,
    audio: null,
    video: null,
    document: null,
  });

  // === Typing presence (debounced) ===
  const typingActiveRef = useRef(false);
  const typingStartTimeoutRef = useRef<number | null>(null);
  const typingStopTimeoutRef = useRef<number | null>(null);

  const clearTypingTimeouts = useCallback(() => {
    if (typingStartTimeoutRef.current !== null) {
      window.clearTimeout(typingStartTimeoutRef.current);
      typingStartTimeoutRef.current = null;
    }
    if (typingStopTimeoutRef.current !== null) {
      window.clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }
  }, []);

  const stopTypingNow = useCallback(() => {
    clearTypingTimeouts();
    if (typingActiveRef.current) {
      typingActiveRef.current = false;
      onTypingChange?.(false);
    }
  }, [clearTypingTimeouts, onTypingChange]);

  const noteUserTyping = useCallback(() => {
    if (!onTypingChange) return;
    if (typingStopTimeoutRef.current !== null) {
      window.clearTimeout(typingStopTimeoutRef.current);
      typingStopTimeoutRef.current = null;
    }
    if (!typingActiveRef.current) {
      if (typingStartTimeoutRef.current === null) {
        typingStartTimeoutRef.current = window.setTimeout(() => {
          typingStartTimeoutRef.current = null;
          typingActiveRef.current = true;
          onTypingChange(true);
        }, TYPING_START_DEBOUNCE_MS);
      }
    }
    typingStopTimeoutRef.current = window.setTimeout(() => {
      typingStopTimeoutRef.current = null;
      stopTypingNow();
    }, TYPING_STOP_DEBOUNCE_MS);
  }, [onTypingChange, stopTypingNow]);

  const handleLexicalHeightChange = useCallback((nextHeight: number) => {
    setComposerHeight((current) => (current === nextHeight ? current : nextHeight));
  }, []);

  const handleLexicalPlainChange = useCallback((plain: string) => {
    setText(plain);
    if (plain.length > 0) {
      noteUserTyping();
    } else {
      stopTypingNow();
    }
  }, [noteUserTyping, stopTypingNow]);

  useEffect(() => {
    return () => {
      clearTypingTimeouts();
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        onTypingChange?.(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSnippets = useMemo(() => {
    if (!snippets?.length || !text.startsWith('/')) return [];
    const query = text.toLowerCase();
    return snippets.filter(
      (s) => s.shortcut.toLowerCase().startsWith(query) || s.label.toLowerCase().includes(query.slice(1)),
    );
  }, [text, snippets]);

  const showSnippetMenu = filteredSnippets.length > 0 && !text.includes('\n');

  useEffect(() => {
    setSnippetHighlight(0);
  }, [filteredSnippets.length]);

  const applySnippet = useCallback((snippet: WhatsAppSnippet) => {
    lexicalEditorRef.current?.setWhatsAppText(snippet.body);
    lexicalEditorRef.current?.focus();
  }, []);

  const insertAtSelection = useCallback((value: string) => {
    lexicalEditorRef.current?.insertAtSelection(value);
  }, []);

  const wrapSelection = useCallback((before: string, after = before) => {
    lexicalEditorRef.current?.wrapSelection(before, after);
  }, []);

  const handleStickerFileSelected = useCallback(async (file: File) => {
    if (!onUploadSticker) return;
    setStickerUploading(true);
    setSendError(null);
    try {
      await onUploadSticker(file);
      await onRefreshStickers?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo subir el sticker';
      setSendError(message);
    } finally {
      setStickerUploading(false);
    }
  }, [onRefreshStickers, onUploadSticker]);

  const handleSendSticker = useCallback(async (sticker: WhatsAppSticker) => {
    if (!onSendSticker || sending) return;
    setSending(true);
    setSendError(null);
    stopTypingNow();
    try {
      await onSendSticker(sticker);
      setStickerAnchorEl(null);
      lexicalEditorRef.current?.focus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo enviar el sticker';
      setSendError(message);
    } finally {
      setSending(false);
    }
  }, [onSendSticker, sending, stopTypingNow]);

  useEffect(() => {
    if (draftText !== undefined && draftText !== '') {
      lexicalEditorRef.current?.setWhatsAppText(draftText);
      lexicalEditorRef.current?.focus();
    }
  }, [draftText]);

  const clearPendingFile = useCallback((id?: string) => {
    setPendingFiles((prev) => {
      const removed = id ? prev.filter((item) => item.id === id) : prev;
      removed.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview);
        if (item.audioUrl) URL.revokeObjectURL(item.audioUrl);
      });
      return id ? prev.filter((item) => item.id !== id) : [];
    });
  }, []);

  const stopTimer = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  // Limpieza al desmontar para liberar el micrófono y los object URLs.
  useEffect(() => {
    return () => {
      stopTimer();
      if (recorderRef.current) {
        try {
          recorderRef.current.cancel();
        } catch {
          // ignore
        }
        recorderRef.current = null;
      }
    };
  }, [stopTimer]);

  const startRecording = useCallback(async () => {
    if (!onSendMedia) return;
    setSendError(null);

    if (!isVoiceRecorderSupported()) {
      setSendError('Tu navegador no soporta grabación de notas de voz (requiere AudioWorklet).');
      return;
    }

    try {
      const handle = await startVoiceRecording();
      recorderRef.current = handle;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - handle.startedAt) / 1000));
      }, 500);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === 'NotAllowedError'
            ? 'Permiso de micrófono denegado por el navegador.'
            : err.message
          : 'No se pudo iniciar la grabación.';
      setSendError(msg);
      setIsRecording(false);
    }
  }, [onSendMedia]);

  const stopRecording = useCallback(async () => {
    const handle = recorderRef.current;
    if (!handle) return;
    stopTimer();
    try {
      const { blob, durationSeconds } = await handle.stop();
      const filename = `voice-${Date.now()}.${VOICE_NOTE_EXT}`;
      // OGG/Opus mono 48 kHz validado contra Storage rules y aceptado por Meta.
      const file = new File([blob], filename, { type: VOICE_NOTE_MIME });
      const audioUrl = URL.createObjectURL(blob);
      setPendingFiles((prev) => [...prev, {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file,
        mediaType: 'audio',
        label: 'Nota de voz',
        status: 'queued',
        isRecorded: true,
        audioUrl,
        durationSeconds,
      }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo finalizar la grabación.';
      setSendError(msg);
    } finally {
      recorderRef.current = null;
      setIsRecording(false);
      setRecordingSeconds(0);
    }
  }, [stopTimer]);

  const cancelRecordingInProgress = useCallback(() => {
    stopTimer();
    if (recorderRef.current) {
      try {
        recorderRef.current.cancel();
      } catch {
        // ignore
      }
      recorderRef.current = null;
    }
    setIsRecording(false);
    setRecordingSeconds(0);
  }, [stopTimer]);

  const handleSend = useCallback(async () => {
    if (sending) return;
    setSendError(null);
    stopTypingNow();

    if (pendingFiles.length > 0 && (onSendMediaBatch || onSendMedia)) {
      setSending(true);
      try {
        if (onSendMediaBatch) {
          const result = await onSendMediaBatch(
            pendingFiles.map(({ id, file, mediaType, label, isRecorded, audioUrl, durationSeconds }) => ({
              id,
              file,
              mediaType,
              label,
              isRecorded,
              audioUrl,
              durationSeconds,
            })),
            text.trim() || undefined,
            (id, status, error) => {
              setPendingFiles((prev) => prev.map((item) => (
                item.id === id ? { ...item, status, error } : item
              )));
            },
          );
          if (result.failedClientAttachmentIds.length > 0) {
            const failedSet = new Set(result.failedClientAttachmentIds);
            setPendingFiles((prev) => prev.filter((item) => {
              const keep = failedSet.has(item.id);
              if (!keep) {
                if (item.preview) URL.revokeObjectURL(item.preview);
                if (item.audioUrl) URL.revokeObjectURL(item.audioUrl);
              }
              return keep;
            }));
            setSendError('Algunos adjuntos no se enviaron. Revisa los marcados en rojo e intenta de nuevo.');
          } else {
            lexicalEditorRef.current?.setWhatsAppText('');
            clearPendingFile();
          }
        } else if (onSendMedia && pendingFiles[0]) {
          const first = pendingFiles[0];
          await onSendMedia(first.file, first.mediaType, text.trim() || undefined);
          lexicalEditorRef.current?.setWhatsAppText('');
          clearPendingFile(first.id);
        }
        lexicalEditorRef.current?.focus();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'No se pudo enviar el archivo';
        setSendError(msg);
      } finally {
        setSending(false);
      }
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      await onSend(trimmed);
      lexicalEditorRef.current?.setWhatsAppText('');
      lexicalEditorRef.current?.focus();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'No se pudo enviar el mensaje';
      setSendError(msg);
    } finally {
      setSending(false);
    }
  }, [text, sending, onSend, onSendMedia, onSendMediaBatch, pendingFiles, clearPendingFile, stopTypingNow]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showSnippetMenu) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSnippetHighlight((prev) => Math.min(prev + 1, filteredSnippets.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSnippetHighlight((prev) => Math.max(prev - 1, 0));
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          if (filteredSnippets[snippetHighlight]) {
            applySnippet(filteredSnippets[snippetHighlight]);
          }
          return;
        }
        if (e.key === 'Escape') {
          lexicalEditorRef.current?.setWhatsAppText('');
          return;
        }
      }

      // Enter envía; Shift+Enter inserta nueva línea (estándar de editores y clientes de chat).
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend, showSnippetMenu, filteredSnippets, snippetHighlight, applySnippet],
  );

  const handleFileSelected = useCallback(
    (file: File, intendedType?: SupportedMediaType): PendingFile | null => {
      const spec = resolveOutboundMediaSpec(file);
      if (!spec) {
        setSendError('Tipo de archivo no soportado por WhatsApp Cloud API');
        return null;
      }
      if (spec.mediaType === 'sticker') {
        setSendError('Para enviar .webp como sticker, usa el botón de stickers.');
        return null;
      }
      if (intendedType && spec.mediaType !== intendedType) {
        setSendError(
          `El archivo (${spec.label}) no corresponde a la opción seleccionada (${intendedType}). Usa el menú correcto.`,
        );
        return null;
      }
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > spec.maxSizeMB) {
        setSendError(
          `El archivo (${sizeMB.toFixed(1)} MB) supera el límite de ${spec.maxSizeMB} MB para ${spec.label}.`,
        );
        return null;
      }
      setSendError(null);
      const preview = spec.mediaType === 'image' ? URL.createObjectURL(file) : undefined;
      return {
        id: `att_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file,
        mediaType: spec.mediaType as SupportedMediaType,
        preview,
        label: spec.label,
        status: 'queued',
      };
    },
    [],
  );

  const addFilesToQueue = useCallback(
    (files: File[], intendedType?: SupportedMediaType) => {
      if (files.length === 0) return;
      const availableSlots = Math.max(0, 10 - pendingFiles.length);
      if (availableSlots === 0) {
        setSendError('Máximo 10 adjuntos por lote.');
        return;
      }
      const nextFiles = files.slice(0, availableSlots)
        .map((file) => handleFileSelected(file, intendedType))
        .filter((item): item is PendingFile => Boolean(item));
      const totalBytes = [...pendingFiles, ...nextFiles].reduce((sum, item) => sum + item.file.size, 0);
      if (totalBytes > 100 * 1024 * 1024) {
        nextFiles.forEach((item) => {
          if (item.preview) URL.revokeObjectURL(item.preview);
        });
        setSendError('El lote supera 100 MB. Divide los archivos en varios envíos.');
        return;
      }
      setPendingFiles((prev) => [...prev, ...nextFiles]);
      setAnchorEl(null);
    },
    [handleFileSelected, pendingFiles],
  );

  const hasPendingFiles = pendingFiles.length > 0;
  const canSend = hasPendingFiles ? Boolean(onSendMediaBatch || onSendMedia) : Boolean(text.trim());

  const captionPlaceholder = hasPendingFiles
    ? pendingFiles.length === 1 && pendingFiles[0].isRecorded
      ? 'Nota de voz lista — pulsa enviar'
      : 'Añade un texto para el primer adjunto (opcional)'
    : 'Escribe un mensaje';

  const composerDisabled = disabled || sending || isRecording;

  return (
    <Box
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled && !sending && !isRecording) setDragActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        if (disabled || sending || isRecording) return;
        addFilesToQueue(Array.from(e.dataTransfer.files || []));
      }}
      sx={{
        bgcolor: (t) =>
          dragActive
            ? alpha(t.palette.success.main, t.palette.mode === 'dark' ? 0.18 : 0.12)
            : t.palette.mode === 'dark' ? alpha(t.palette.common.white, 0.04) : '#f0f2f5',
        borderTop: 1,
        borderColor: dragActive ? 'success.main' : 'divider',
        transition: 'background-color 0.15s, border-color 0.15s',
      }}
    >
      {sendError && (
        <Alert severity="error" onClose={() => setSendError(null)} sx={{ mx: 1.5, mt: 1 }}>
          {sendError}
        </Alert>
      )}
      {suggestionHint && (
        <Alert
          severity="info"
          onClose={onDismissHint}
          sx={{ mx: 1.5, mt: 1 }}
          action={
            onForceGenerate ? (
              <Button
                size="small"
                variant="outlined"
                color="primary"
                onClick={() => {
                  onDismissHint?.();
                  onForceGenerate();
                }}
                sx={{
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                  px: 1.5,
                  borderWidth: 1.5,
                }}
              >
                Generar de todos modos
              </Button>
            ) : undefined
          }
        >
          {suggestionHint}
        </Alert>
      )}

      {pendingFiles.filter((item) => item.isRecorded && item.audioUrl).map((pendingFile) => (
        <Box
          key={pendingFile.id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            pt: 1,
          }}
        >
          <AudiotrackIcon fontSize="small" sx={{ color: '#25D366' }} />
          <Typography variant="caption" color="text.secondary" sx={{ minWidth: 36 }}>
            {pendingFile.durationSeconds ? formatDuration(pendingFile.durationSeconds) : '—'}
          </Typography>
          <Box
            component="audio"
            controls
            preload="metadata"
            src={pendingFile.audioUrl}
            sx={{ flex: 1, height: 36 }}
          />
          <Tooltip title="Eliminar grabación">
            <IconButton size="small" color="error" onClick={() => clearPendingFile(pendingFile.id)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {pendingFile.status === 'failed' && (
            <Typography variant="caption" color="error">
              {pendingFile.error || 'Falló'}
            </Typography>
          )}
        </Box>
      ))}

      {pendingFiles.filter((item) => !item.isRecorded).length > 0 && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            pt: 1,
            flexWrap: 'wrap',
          }}
        >
          {pendingFiles.filter((item) => !item.isRecorded).map((pendingFile) => {
            const PendingIcon = ICON_BY_TYPE[pendingFile.mediaType];
            const statusText =
              pendingFile.status === 'queued' ? '' :
                pendingFile.status === 'uploading' ? ' · subiendo' :
                  pendingFile.status === 'uploaded' ? ' · subido' :
                    pendingFile.status === 'sending' ? ' · enviando' :
                      pendingFile.status === 'sent' ? ' · enviado' :
                        ' · falló';
            return (
              <Box key={pendingFile.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {pendingFile.preview && (
                  <Box
                    component="img"
                    src={pendingFile.preview}
                    alt="Preview"
                    sx={{ width: 48, height: 48, borderRadius: 1, objectFit: 'cover' }}
                  />
                )}
                <Chip
                  icon={<PendingIcon />}
                  label={`${pendingFile.file.name} · ${(pendingFile.file.size / (1024 * 1024)).toFixed(1)} MB${statusText}`}
                  onDelete={sending ? undefined : () => clearPendingFile(pendingFile.id)}
                  deleteIcon={<CloseIcon />}
                  color={pendingFile.status === 'failed' ? 'error' : 'default'}
                  size="small"
                  sx={{ maxWidth: 420 }}
                />
              </Box>
            );
          })}
        </Box>
      )}

      {showSnippetMenu && (
        <Paper
          elevation={4}
          sx={{
            mx: 1.5,
            mt: 1,
            maxHeight: 200,
            overflow: 'auto',
            borderRadius: 2,
          }}
        >
          <List dense disablePadding>
            {filteredSnippets.map((snippet, idx) => (
              <ListItemButton
                key={snippet.id}
                selected={idx === snippetHighlight}
                onClick={() => applySnippet(snippet)}
                sx={{ py: 0.75 }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight={600} sx={{ color: '#25D366', fontFamily: 'monospace' }}>
                        {snippet.shortcut}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {snippet.label}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {snippet.body.length > 80 ? snippet.body.slice(0, 80) + '…' : snippet.body}
                    </Typography>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}

      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, p: 1.5 }}>
        <Box
          sx={{
            alignItems: 'flex-start',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
            gap: 0.25,
            pb: 0.25,
          }}
        >
          {!isRecording && (
            <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.25 }}>
              <Tooltip title="Negrita (*texto*)">
                <IconButton size="small" disabled={composerDisabled} onClick={() => wrapSelection('*')}>
                  <FormatBoldIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Cursiva (_texto_)">
                <IconButton size="small" disabled={composerDisabled} onClick={() => wrapSelection('_')}>
                  <FormatItalicIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Tachado (~texto~)">
                <IconButton size="small" disabled={composerDisabled} onClick={() => wrapSelection('~')}>
                  <StrikethroughSIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Monoespaciado (`texto`)">
                <IconButton size="small" disabled={composerDisabled} onClick={() => wrapSelection('`')}>
                  <CodeIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}

          <Box sx={{ alignItems: 'center', display: 'flex', gap: 0.25 }}>
            {onRequestSuggestion && (
              <Tooltip title="Sugerir respuesta con IA">
                <span>
                  <IconButton
                    size="small"
                    disabled={composerDisabled || suggestionLoading}
                    onClick={(event) => setAiAnchorEl(event.currentTarget)}
                    sx={{ color: suggestionLoading ? undefined : '#7c3aed' }}
                  >
                    {suggestionLoading ? <CircularProgress size={20} /> : <AutoAwesomeIcon />}
                  </IconButton>
                </span>
              </Tooltip>
            )}
            <Menu
              anchorEl={aiAnchorEl}
              open={Boolean(aiAnchorEl)}
              onClose={() => setAiAnchorEl(null)}
              anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
              transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
              <MenuItem
                onClick={() => {
                  setAiAnchorEl(null);
                  onRequestSuggestion?.();
                }}
              >
                <ListItemIcon>
                  <AutoAwesomeIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary="Automático"
                  secondary="Usa el contexto del chat"
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAiAnchorEl(null);
                  onRequestSuggestion?.({ withContext: true });
                }}
              >
                <ListItemIcon>
                  <AutoAwesomeIcon fontSize="small" sx={{ color: '#7c3aed' }} />
                </ListItemIcon>
                <ListItemText
                  primary="Con contexto"
                  secondary="Agrega una instrucción extra"
                  secondaryTypographyProps={{ variant: 'caption' }}
                />
              </MenuItem>
            </Menu>
            {onSendMedia && (
              <>
                <IconButton
                  size="small"
                  disabled={composerDisabled}
                  onClick={(e) => setAnchorEl(e.currentTarget)}
                >
                  <AttachFileIcon sx={{ transform: 'rotate(45deg)' }} />
                </IconButton>
                <Menu
                  anchorEl={anchorEl}
                  open={Boolean(anchorEl)}
                  onClose={() => setAnchorEl(null)}
                  anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
                  transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                >
                  {MENU_ITEMS.map((item) => (
                    <MenuItem
                      key={item.key}
                      onClick={() => fileInputRefs.current[item.key]?.click()}
                    >
                      <ListItemIcon>
                        <item.Icon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText>{item.label}</ListItemText>
                    </MenuItem>
                  ))}
                </Menu>
                {MENU_ITEMS.map((item) => (
                  <input
                    key={item.key}
                    ref={(el) => {
                      fileInputRefs.current[item.key] = el;
                    }}
                    type="file"
                    accept={item.accept}
                    multiple
                    hidden
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      addFilesToQueue(files, item.key);
                      e.target.value = '';
                    }}
                  />
                ))}
              </>
            )}

            {!onSendMedia && (
              <IconButton size="small" disabled>
                <AttachFileIcon sx={{ transform: 'rotate(45deg)' }} />
              </IconButton>
            )}

            <Tooltip title="Emojis rápidos">
              <IconButton
                size="small"
                disabled={composerDisabled}
                onClick={(e) => setEmojiAnchorEl(e.currentTarget)}
              >
                <EmojiEmotionsIcon />
              </IconButton>
            </Tooltip>

            {onSendSticker && (
              <Tooltip title="Stickers">
                <IconButton
                  size="small"
                  disabled={disabled || sending || isRecording}
                  onClick={(e) => setStickerAnchorEl(e.currentTarget)}
                >
                  <StickyNote2Icon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>

        {/* Compositor: durante grabación se reemplaza por barra con cronómetro y cancelar. */}
        {isRecording ? (
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 1,
              bgcolor: 'background.paper',
              borderRadius: 2,
            }}
          >
            <Box
              sx={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                bgcolor: 'error.main',
                animation: 'wa-pulse 1s ease-in-out infinite',
                '@keyframes wa-pulse': {
                  '0%, 100%': { opacity: 1 },
                  '50%': { opacity: 0.35 },
                },
              }}
            />
            <Typography variant="body2" color="error" fontWeight={500}>
              Grabando · {formatDuration(recordingSeconds)}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Tooltip title="Cancelar grabación">
              <IconButton size="small" onClick={cancelRecordingInProgress}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        ) : (
          <Box
            sx={{
              bgcolor: 'background.paper',
              borderRadius: 2,
              flex: 1,
              minHeight: composerHeight + COMPOSER_VERTICAL_PADDING,
              position: 'relative',
              px: 1.5,
              py: 1,
              '&:focus-within': {
                boxShadow: (t) => `0 0 0 2px ${alpha(t.palette.primary.main, 0.18)}`,
              },
            }}
          >
            <WhatsAppLexicalEditor
              ref={lexicalEditorRef}
              disabled={composerDisabled}
              ariaLabel={captionPlaceholder}
              placeholder={captionPlaceholder}
              composerMinHeight={COMPOSER_MIN_TEXTAREA_HEIGHT}
              composerMaxHeight={COMPOSER_MAX_TEXTAREA_HEIGHT}
              onHeightChange={handleLexicalHeightChange}
              onPlainTextChange={handleLexicalPlainChange}
              onKeyDown={handleKeyDown}
              onBlur={stopTypingNow}
            />
          </Box>
        )}

        {/* Botón micrófono / detener grabación. Solo visible si el contenedor permite envío de media. */}
        {onSendMedia &&
          (isRecording ? (
            <Tooltip title="Detener grabación">
              <IconButton onClick={stopRecording} sx={{ color: 'error.main' }}>
                <StopCircleIcon />
              </IconButton>
            </Tooltip>
          ) : !pendingFiles.some((item) => item.isRecorded) ? (
            <Tooltip title="Grabar nota de voz">
              <span>
                <IconButton
                  onClick={startRecording}
                  disabled={disabled || sending || pendingFiles.length >= 10}
                  sx={{ color: 'text.secondary' }}
                >
                  <MicIcon />
                </IconButton>
              </span>
            </Tooltip>
          ) : null)}

        <IconButton
          onClick={handleSend}
          disabled={!canSend || sending || disabled || isRecording}
          sx={{ color: 'text.secondary' }}
        >
          {sending ? <CircularProgress size={24} /> : <SendIcon />}
        </IconButton>
      </Box>

      <Popover
        open={Boolean(emojiAnchorEl)}
        anchorEl={emojiAnchorEl}
        onClose={() => setEmojiAnchorEl(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 220, p: 1 }}>
          {QUICK_EMOJIS.map((emoji) => (
            <Button
              key={emoji}
              onClick={() => {
                insertAtSelection(emoji);
                setEmojiAnchorEl(null);
              }}
              sx={{ minWidth: 36, fontSize: 20 }}
            >
              {emoji}
            </Button>
          ))}
        </Box>
      </Popover>

      <Popover
        open={Boolean(stickerAnchorEl)}
        anchorEl={stickerAnchorEl}
        onClose={() => setStickerAnchorEl(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        PaperProps={{ sx: { width: 320, maxWidth: '90vw' } }}
      >
        <Box sx={{ p: 1.5 }}>
          <Box sx={{ alignItems: 'center', display: 'flex', gap: 1, mb: 1 }}>
            <Typography variant="subtitle2" sx={{ flex: 1 }}>
              Stickers compartidos
            </Typography>
            {stickersLoading && <CircularProgress size={16} />}
            <Button
              size="small"
              disabled={stickerUploading || !onUploadSticker}
              onClick={() => stickerInputRef.current?.click()}
            >
              Subir .webp
            </Button>
            <input
              ref={stickerInputRef}
              type="file"
              accept="image/webp,.webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) void handleStickerFileSelected(file);
              }}
            />
          </Box>
          {stickers.length === 0 && !stickersLoading ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
              Aún no hay stickers compartidos.
            </Typography>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gap: 1,
                gridTemplateColumns: 'repeat(3, 1fr)',
                maxHeight: 260,
                overflow: 'auto',
              }}
            >
              {stickers.map((sticker) => (
                <Button
                  key={sticker.id}
                  disabled={sending}
                  onClick={() => void handleSendSticker(sticker)}
                  sx={{
                    alignItems: 'center',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 2,
                    display: 'flex',
                    height: 84,
                    justifyContent: 'center',
                    p: 0.5,
                  }}
                >
                  <Box
                    component="img"
                    src={sticker.downloadUrl}
                    alt={sticker.name}
                    sx={{ maxHeight: 72, maxWidth: 72, objectFit: 'contain' }}
                  />
                </Button>
              ))}
            </Box>
          )}
          {stickerUploading && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Subiendo sticker...
            </Typography>
          )}
        </Box>
      </Popover>
    </Box>
  );
};

export default MessageInput;
