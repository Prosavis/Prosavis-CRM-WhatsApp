import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Link,
  Checkbox,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  Button,
  TextField,
  Chip,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DoneIcon from '@mui/icons-material/Done';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ImageIcon from '@mui/icons-material/Image';
import VideocamIcon from '@mui/icons-material/Videocam';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PersonIcon from '@mui/icons-material/Person';
import PhoneIcon from '@mui/icons-material/Phone';
import BusinessIcon from '@mui/icons-material/Business';
import DownloadIcon from '@mui/icons-material/Download';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import RefreshIcon from '@mui/icons-material/Refresh';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import CloseIcon from '@mui/icons-material/Close';
import ReplyIcon from '@mui/icons-material/Reply';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AddReactionIcon from '@mui/icons-material/AddReaction';
import SubtitlesIcon from '@mui/icons-material/Subtitles';
import type { WhatsAppContact, WhatsAppMessage } from '@/services/whatsappService';
import {
  getMediaUrl,
  getWhatsAppMediaSignedUrl,
  isMetaHostedMediaUrl,
  downloadMediaBlob,
  getExtensionFromMime,
  transcribeWhatsAppInboundAudio,
} from '@/services/whatsappService';
import ClientDateText from '@/components/common/ClientDateText';
import { WhatsAppFormattedText } from '@/utils/whatsappTextFormatting';

export interface MessageReaction {
  actorKey: string;
  emoji: string;
  direction: 'inbound' | 'outbound';
  pending?: boolean;
}

interface MessageBubbleProps {
  message: WhatsAppMessage;
  allMessages?: WhatsAppMessage[];
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onDelete?: (id: string) => void;
  onReply?: (msg: WhatsAppMessage) => void;
  reactions?: MessageReaction[];
  currentAgentReactionEmoji?: string;
  reacting?: boolean;
  onReact?: (msg: WhatsAppMessage, emoji: string) => void;
}

const mediaCache = new Map<string, { url: string; mimeType: string }>();

const MESSAGE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
};

const getContactDisplayName = (contact: WhatsAppContact) =>
  contact.name?.formatted_name ||
  [contact.name?.first_name, contact.name?.last_name].filter(Boolean).join(' ') ||
  'Contacto';

const getContactKey = (contact: WhatsAppContact) =>
  [
    contact.name?.formatted_name,
    contact.name?.first_name,
    contact.name?.last_name,
    contact.org?.company,
    contact.phones?.map((phone) => `${phone.phone || ''}:${phone.type || ''}`).join('|'),
  ]
    .filter(Boolean)
    .join('|') || 'contacto-sin-datos';

const getPhoneKey = (phone: { phone?: string; type?: string }) =>
  [phone.phone, phone.type].filter(Boolean).join('|') || 'telefono-sin-datos';

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'read':
      return <DoneAllIcon sx={{ fontSize: 16, color: '#53bdeb' }} />;
    case 'delivered':
      return <DoneAllIcon sx={{ fontSize: 16, color: '#8696a0' }} />;
    case 'sent':
      return <DoneIcon sx={{ fontSize: 16, color: '#8696a0' }} />;
    case 'failed':
      return <ErrorOutlineIcon sx={{ fontSize: 16, color: '#ea0038' }} />;
    default:
      return <AccessTimeIcon sx={{ fontSize: 16, color: '#8696a0' }} />;
  }
}

function useMediaPrefetch(message: WhatsAppMessage) {
  const [mediaData, setMediaData] = useState<{ url: string; mimeType: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const fetchedRef = useRef(false);

  const directUrl =
    message.mediaUrl && !isMetaHostedMediaUrl(message.mediaUrl) ? message.mediaUrl : null;
  const cacheKey = message.mediaId ?? message.storagePath ?? null;

  const resolveMedia = useCallback(async () => {
    if (directUrl || mediaData || loading) return;
    if (!message.mediaId && !message.storagePath) return;

    if (cacheKey && mediaCache.has(cacheKey)) {
      setMediaData(mediaCache.get(cacheKey)!);
      return;
    }

    setLoading(true);
    setError(false);
    try {
      if (message.storagePath) {
        const signed = await getWhatsAppMediaSignedUrl({ storagePath: message.storagePath });
        const data = {
          url: signed,
          mimeType: message.mimeType || 'application/octet-stream',
        };
        if (cacheKey) mediaCache.set(cacheKey, data);
        setMediaData(data);
        return;
      }

      if (!message.mediaId) {
        setError(true);
        return;
      }

      const result = await getMediaUrl(message.mediaId, {
        storagePath: message.storagePath,
        mimeType: message.mimeType,
        stableKeyHint: message.recipientPhone,
      });
      const data = { url: result.url, mimeType: result.mimeType };
      mediaCache.set(message.mediaId, data);
      setMediaData(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [
    message.mediaId,
    message.storagePath,
    message.mimeType,
    message.recipientPhone,
    directUrl,
    mediaData,
    loading,
    cacheKey,
  ]);

  useEffect(() => {
    if (directUrl) return;
    if (!message.mediaId && !message.storagePath) return;
    if (fetchedRef.current) return;
    if (cacheKey && mediaCache.has(cacheKey)) {
      setMediaData(mediaCache.get(cacheKey)!);
      return;
    }
    fetchedRef.current = true;
    resolveMedia();
  }, [message.mediaId, message.storagePath, directUrl, resolveMedia, cacheKey]);

  const effectiveUrl = directUrl || mediaData?.url || null;
  const effectiveMime = mediaData?.mimeType || '';

  return { effectiveUrl, effectiveMime, loading, error, resolveMedia };
}

const MediaContent: React.FC<{ message: WhatsAppMessage; onOpenLightbox?: (url: string) => void }> = ({ message, onOpenLightbox }) => {
  const { effectiveUrl, effectiveMime, loading, error, resolveMedia } = useMediaPrefetch(message);
  const [transcript, setTranscript] = useState(message.voiceTranscription || '');
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState('');

  useEffect(() => {
    setTranscript(message.voiceTranscription || '');
    setTranscriptionError(message.voiceTranscriptionError || '');
  }, [message.voiceTranscription, message.voiceTranscriptionError]);

  const handleDownload = useCallback(async () => {
    if (!effectiveUrl) return;
    const ext = getExtensionFromMime(effectiveMime);
    const name = message.filename || `wa-${message.mediaId || 'file'}.${ext}`;
    await downloadMediaBlob(effectiveUrl, name);
  }, [effectiveUrl, effectiveMime, message.filename, message.mediaId]);

  const handleTranscribe = useCallback(async (force = false) => {
    if (!message.mediaId) return;
    setTranscribing(true);
    setTranscriptionError('');
    try {
      const result = await transcribeWhatsAppInboundAudio(message.id, force);
      setTranscript(result.transcript);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo transcribir el audio';
      setTranscriptionError(msg);
    } finally {
      setTranscribing(false);
    }
  }, [message.id, message.mediaId]);

  const transcriptionControls =
    message.mediaType === 'audio' && message.direction === 'inbound' && message.mediaId ? (
      <Box sx={{ mt: 0.75 }}>
        {transcript ? (
          <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'rgba(37, 211, 102, 0.08)' }}>
            <Typography variant="caption" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <SubtitlesIcon sx={{ fontSize: 14 }} />
              Transcripción
            </Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.25 }}>
              {transcript}
            </Typography>
            <Button
              size="small"
              variant="text"
              disabled={transcribing}
              onClick={() => void handleTranscribe(true)}
              sx={{ mt: 0.5, px: 0 }}
            >
              {transcribing ? 'Transcribiendo…' : 'Volver a transcribir'}
            </Button>
          </Box>
        ) : (
          <Button
            size="small"
            variant="outlined"
            startIcon={transcribing ? <CircularProgress size={14} /> : <SubtitlesIcon />}
            disabled={transcribing}
            onClick={() => void handleTranscribe(false)}
          >
            {transcribing ? 'Transcribiendo…' : 'Transcribir'}
          </Button>
        )}
        {transcriptionError && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
            {transcriptionError}
          </Typography>
        )}
      </Box>
    ) : null;

  if (message.mediaType === 'sticker') {
    if (effectiveUrl) {
      return (
        <Box
          sx={{
            mb: 0.5,
            maxWidth: 180,
            position: 'relative',
            '&:hover .sticker-actions': { opacity: 1 },
          }}
        >
          <Box
            component="img"
            src={effectiveUrl}
            alt="Sticker"
            loading="lazy"
            sx={{
              display: 'block',
              maxHeight: 180,
              maxWidth: 180,
              objectFit: 'contain',
            }}
          />
          <Box
            className="sticker-actions"
            sx={{
              display: 'flex',
              gap: 0.5,
              opacity: 0,
              position: 'absolute',
              right: 0,
              top: 0,
              transition: 'opacity 0.2s',
            }}
          >
            <IconButton
              size="small"
              sx={{ bgcolor: 'rgba(0,0,0,0.45)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' } }}
              onClick={handleDownload}
            >
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      );
    }
    return (
      <Box onClick={resolveMedia} sx={{ mb: 0.5, p: 1.25, bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1, cursor: message.mediaId ? 'pointer' : 'default' }}>
        {loading ? <CircularProgress size={20} /> : error ? (
          <>
            <ImageIcon sx={{ color: '#667781' }} />
            <Typography variant="caption" color="text.secondary">No se pudo cargar el sticker</Typography>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); resolveMedia(); }}><RefreshIcon fontSize="small" /></IconButton>
          </>
        ) : (
          <>
            <ImageIcon sx={{ color: '#667781' }} />
            <Typography variant="caption" color="text.secondary">Sticker — toca para cargar</Typography>
          </>
        )}
      </Box>
    );
  }

  if (message.mediaType === 'image') {
    if (effectiveUrl) {
      return (
        <Box sx={{ mb: 0.5, borderRadius: 1, overflow: 'hidden', maxWidth: 300, position: 'relative', '&:hover .img-actions': { opacity: 1 } }}>
          <img
            src={effectiveUrl}
            alt={message.caption || 'Imagen'}
            style={{ width: '100%', display: 'block', borderRadius: 4, cursor: 'pointer' }}
            loading="lazy"
            onClick={() => onOpenLightbox?.(effectiveUrl)}
          />
          <Box className="img-actions" sx={{ position: 'absolute', top: 4, right: 4, opacity: 0, transition: 'opacity 0.2s', display: 'flex', gap: 0.5 }}>
            <IconButton size="small" sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }} onClick={() => onOpenLightbox?.(effectiveUrl)}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }} onClick={handleDownload}>
              <DownloadIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      );
    }
    return (
      <Box onClick={resolveMedia} sx={{ mb: 0.5, p: 2, bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1, cursor: message.mediaId ? 'pointer' : 'default' }}>
        {loading ? <CircularProgress size={20} /> : error ? (
          <>
            <ImageIcon sx={{ color: '#667781' }} />
            <Typography variant="caption" color="text.secondary">No se pudo cargar</Typography>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); resolveMedia(); }}><RefreshIcon fontSize="small" /></IconButton>
          </>
        ) : (
          <>
            <ImageIcon sx={{ color: '#667781' }} />
            <Typography variant="caption" color="text.secondary">Imagen — toca para ver</Typography>
          </>
        )}
      </Box>
    );
  }

  if (message.mediaType === 'audio') {
    if (effectiveUrl) {
      return (
        <Box sx={{ mb: 0.5, minWidth: 240 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <audio controls style={{ flex: 1, height: 36 }} preload="metadata">
              <source src={effectiveUrl} type={effectiveMime || undefined} />
            </audio>
            <IconButton size="small" onClick={handleDownload}><DownloadIcon fontSize="small" /></IconButton>
          </Box>
          {transcriptionControls}
        </Box>
      );
    }
    return (
      <Box onClick={resolveMedia} sx={{ mb: 0.5, p: 1.5, bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1, cursor: message.mediaId ? 'pointer' : 'default' }}>
        {loading ? <CircularProgress size={20} /> : (
          <>
            <PlayArrowIcon sx={{ color: '#667781' }} />
            <Typography variant="caption" color="text.secondary">{message.isVoiceNote ? 'Nota de voz' : 'Audio'} — toca para reproducir</Typography>
          </>
        )}
        {transcriptionControls}
      </Box>
    );
  }

  if (message.mediaType === 'video') {
    if (effectiveUrl) {
      return (
        <Box sx={{ mb: 0.5, maxWidth: 300, borderRadius: 1, overflow: 'hidden' }}>
          <video controls style={{ width: '100%', display: 'block' }} preload="metadata">
            <source src={effectiveUrl} />
          </video>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.25 }}>
            <IconButton size="small" onClick={handleDownload}><DownloadIcon fontSize="small" /></IconButton>
          </Box>
        </Box>
      );
    }
    return (
      <Box onClick={resolveMedia} sx={{ mb: 0.5, p: 2, bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1, cursor: message.mediaId ? 'pointer' : 'default' }}>
        {loading ? <CircularProgress size={20} /> : <VideocamIcon sx={{ color: '#667781' }} />}
        <Typography variant="caption" color="text.secondary">Video — toca para ver</Typography>
      </Box>
    );
  }

  if (message.mediaType === 'document') {
    return (
      <Box sx={{ mb: 0.5, p: 1.5, bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
        <InsertDriveFileIcon sx={{ color: '#667781' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" noWrap>{message.filename || 'Documento'}</Typography>
        </Box>
        {effectiveUrl ? (
          <IconButton size="small" onClick={handleDownload}><DownloadIcon fontSize="small" /></IconButton>
        ) : message.mediaId ? (
          <IconButton size="small" onClick={resolveMedia} disabled={loading}>
            {loading ? <CircularProgress size={16} /> : <DownloadIcon fontSize="small" />}
          </IconButton>
        ) : null}
      </Box>
    );
  }

  return null;
};

const LocationContent: React.FC<{ message: WhatsAppMessage }> = ({ message }) => {
  if (!message.location) return null;
  const { latitude, longitude, name, address } = message.location;
  const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
  return (
    <Box sx={{ mb: 0.5 }}>
      <Link href={mapsUrl} target="_blank" rel="noopener" underline="none">
        <Box sx={{ bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1, p: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1, '&:hover': { bgcolor: 'rgba(0,0,0,0.08)' } }}>
          <LocationOnIcon sx={{ color: '#ea4335', mt: 0.25 }} />
          <Box>
            {name && <Typography variant="body2" fontWeight={500}>{name}</Typography>}
            {address && <Typography variant="caption" color="text.secondary">{address}</Typography>}
            <Typography variant="caption" sx={{ display: 'block', color: '#1a73e8', mt: 0.25 }}>
              {latitude.toFixed(6)}, {longitude.toFixed(6)} — Abrir en Maps
            </Typography>
          </Box>
        </Box>
      </Link>
    </Box>
  );
};

const ContactsContent: React.FC<{ message: WhatsAppMessage }> = ({ message }) => {
  if (!message.contacts?.length) return null;
  return (
    <Box sx={{ mb: 0.5 }}>
      {message.contacts.map((contact, idx) => (
        <Box key={getContactKey(contact)} sx={{ bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1, p: 1.5, mb: idx < message.contacts!.length - 1 ? 0.5 : 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <PersonIcon sx={{ fontSize: 18, color: '#667781' }} />
            <Typography variant="body2" fontWeight={500}>
              {getContactDisplayName(contact)}
            </Typography>
          </Box>
          {contact.phones?.map((phone) => (
            <Box key={getPhoneKey(phone)} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 3 }}>
              <PhoneIcon sx={{ fontSize: 14, color: '#667781' }} />
              <Typography variant="caption">{phone.phone} {phone.type && `(${phone.type})`}</Typography>
            </Box>
          ))}
          {contact.org?.company && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 3, mt: 0.25 }}>
              <BusinessIcon sx={{ fontSize: 14, color: '#667781' }} />
              <Typography variant="caption">{contact.org.company}</Typography>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
};

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  allMessages = [],
  selectionMode,
  selected,
  onToggleSelect,
  onDelete,
  onReply,
  reactions = [],
  currentAgentReactionEmoji,
  reacting,
  onReact,
}) => {
  const theme = useTheme();
  const isOutbound = message.direction === 'outbound';

  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [reactionDialogOpen, setReactionDialogOpen] = useState(false);
  const [reactionValue, setReactionValue] = useState('');

  const hasMedia = Boolean(message.mediaType);
  const hasLocation = Boolean(message.location);
  const hasContacts = Boolean(message.contacts?.length);

  const caption = message.caption || '';
  const body = message.messageBody || '';
  const bodyIsMediaTag = body.startsWith('[');
  const displayText = hasMedia && caption ? caption : bodyIsMediaTag ? '' : body;
  const showTextBody = Boolean(displayText);

  const copyablePlainText = (() => {
    if (showTextBody) return displayText;
    if (!hasMedia && !hasLocation && !hasContacts && body) return body;
    if (caption.trim()) return caption;
    return '';
  })().trim();

  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const handleCopyText = useCallback(async () => {
    setMenuAnchor(null);
    if (!copyablePlainText) return;
    try {
      await navigator.clipboard.writeText(copyablePlainText);
      setSnack({ open: true, message: 'Copiado al portapapeles', severity: 'success' });
    } catch {
      setSnack({ open: true, message: 'No se pudo copiar', severity: 'error' });
    }
  }, [copyablePlainText]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    setMenuAnchor(e.currentTarget);
  }, []);

  const handleOpenReactionDialog = useCallback(() => {
    setMenuAnchor(null);
    setReactionValue(currentAgentReactionEmoji || '');
    setReactionDialogOpen(true);
  }, [currentAgentReactionEmoji]);

  const handleSubmitReaction = useCallback((emoji: string) => {
    const nextEmoji = emoji.trim();
    if (!message.waMessageId || !onReact) return;
    onReact(message, nextEmoji);
    setReactionDialogOpen(false);
  }, [message, onReact]);

  return (
    <>
      <Box
        id={`msg-${message.id}`}
        sx={{
          display: 'flex',
          justifyContent: isOutbound ? 'flex-end' : 'flex-start',
          alignItems: 'center',
          mb: reactions.length > 0 ? 2 : 0.5,
          px: 2,
        }}
      >
        {selectionMode && (
          <Checkbox
            size="small"
            checked={selected}
            onChange={() => onToggleSelect?.(message.id)}
            sx={{ mr: 0.5, p: 0.25 }}
          />
        )}
        <Box
          onContextMenu={handleContextMenu}
          sx={{
            maxWidth: '65%',
            minWidth: 80,
            bgcolor: isOutbound
              ? theme.palette.mode === 'dark'
                ? alpha('#86ffb0', 0.22)
                : '#d9fdd3'
              : theme.palette.mode === 'dark'
                ? theme.palette.grey[800]
                : '#ffffff',
            borderRadius: 2,
            px: 1.5,
            py: 0.75,
            position: 'relative',
            boxShadow: (t) =>
              t.palette.mode === 'dark'
                ? '0 1px 2px rgba(0,0,0,0.35)'
                : '0 1px 0.5px rgba(11,20,26,.13)',
            '&:hover .msg-menu-btn': { opacity: 1 },
          }}
        >
          {!selectionMode && (
            <IconButton
              className="msg-menu-btn"
              size="small"
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              sx={{ position: 'absolute', top: 2, right: 2, opacity: 0, transition: 'opacity 0.15s', p: 0.25, bgcolor: isOutbound ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.04)' }}
            >
              <MoreVertIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}

          {message.replyToWaMessageId && (() => {
            const quoted = allMessages.find((m) => m.waMessageId === message.replyToWaMessageId);
            if (!quoted) return null;
            const quotedText = quoted.messageBody || quoted.caption || `[${quoted.mediaType || 'media'}]`;
            return (
              <Box
                sx={{
                  borderLeft: '3px solid',
                  borderColor: quoted.direction === 'inbound' ? '#06cf9c' : '#53bdeb',
                  bgcolor: 'rgba(0,0,0,0.05)',
                  borderRadius: 1,
                  px: 1,
                  py: 0.5,
                  mb: 0.5,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  const el = document.getElementById(`msg-${quoted.id}`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                <Typography variant="caption" fontWeight={600} color={quoted.direction === 'inbound' ? '#06cf9c' : '#53bdeb'}>
                  {quoted.direction === 'inbound' ? 'Cliente' : 'Tú'}
                </Typography>
                <Typography variant="caption" display="block" noWrap color="text.secondary">
                  {quotedText}
                </Typography>
              </Box>
            );
          })()}

          {isOutbound && message.senderType !== 'agent' && (
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.25 }}>
              <SmartToyIcon sx={{ fontSize: 14, color: '#667781', mr: 0.5 }} />
              <Typography variant="caption" sx={{ color: '#667781', fontWeight: 500 }}>
                {message.senderType === 'bot' ? 'Bot' : 'Sistema'}
              </Typography>
            </Box>
          )}

          {hasMedia && <MediaContent message={message} onOpenLightbox={setLightboxUrl} />}
          {hasLocation && <LocationContent message={message} />}
          {hasContacts && <ContactsContent message={message} />}

          {showTextBody && (
            <Typography
              variant="body2"
              component="div"
              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'text.primary', lineHeight: 1.4 }}
            >
              <WhatsAppFormattedText text={displayText} />
            </Typography>
          )}

          {!showTextBody && !hasMedia && !hasLocation && !hasContacts && body && (
            <Typography
              variant="body2"
              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'text.primary', lineHeight: 1.4 }}
            >
              {body}
            </Typography>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5, mt: 0.25, ml: 2, float: 'right' }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6875rem' }}>
              <ClientDateText
                value={message.createdAt}
                locale="es-CO"
                options={MESSAGE_TIME_OPTIONS}
                fallback=""
                includeTime
              />
            </Typography>
            {isOutbound && <StatusIcon status={message.status} />}
          </Box>
          <Box sx={{ clear: 'both' }} />
          {reactions.length > 0 && (
            <Box
              sx={{
                position: 'absolute',
                bottom: -18,
                right: isOutbound ? 8 : 'auto',
                left: isOutbound ? 'auto' : 8,
                display: 'flex',
                gap: 0.25,
                zIndex: 1,
              }}
            >
              {reactions.map((reaction) => (
                <Chip
                  key={reaction.actorKey}
                  label={reaction.emoji}
                  size="small"
                  sx={{
                    height: 22,
                    minWidth: 28,
                    bgcolor: (t) => t.palette.mode === 'dark' ? alpha(t.palette.background.paper, 0.95) : '#fff',
                    opacity: reaction.pending ? 0.65 : 1,
                    boxShadow: '0 1px 2px rgba(0,0,0,0.18)',
                    '& .MuiChip-label': { px: 0.75, fontSize: 15 },
                  }}
                />
              ))}
            </Box>
          )}
        </Box>
      </Box>

      {/* Context menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {onReply && message.waMessageId && (
          <MenuItem onClick={() => { setMenuAnchor(null); onReply(message); }}>
            <ListItemIcon><ReplyIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Responder</ListItemText>
          </MenuItem>
        )}
        {copyablePlainText ? (
          <MenuItem onClick={() => void handleCopyText()}>
            <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Copiar</ListItemText>
          </MenuItem>
        ) : null}
        {onReact && message.waMessageId && (
          <MenuItem onClick={handleOpenReactionDialog} disabled={reacting}>
            <ListItemIcon><AddReactionIcon fontSize="small" /></ListItemIcon>
            <ListItemText>{currentAgentReactionEmoji ? 'Cambiar reacción' : 'Reaccionar'}</ListItemText>
          </MenuItem>
        )}
        {onReact && message.waMessageId && currentAgentReactionEmoji && (
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              onReact(message, '');
            }}
            disabled={reacting}
          >
            <ListItemIcon><CloseIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Quitar reacción</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => { setMenuAnchor(null); onDelete?.(message.id); }}>
          <ListItemIcon><DeleteOutlineIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Eliminar</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={reactionDialogOpen} onClose={() => setReactionDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reaccionar al mensaje</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2, pt: 0.5 }}>
            {QUICK_REACTIONS.map((emoji) => (
              <Button
                key={emoji}
                variant={emoji === reactionValue ? 'contained' : 'outlined'}
                onClick={() => handleSubmitReaction(emoji)}
                sx={{ minWidth: 44, fontSize: 20 }}
              >
                {emoji}
              </Button>
            ))}
          </Box>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Emoji personalizado"
            value={reactionValue}
            onChange={(e) => setReactionValue(e.target.value)}
            placeholder="Pega o escribe un emoji"
            helperText="Meta validará si el emoji es compatible."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReactionDialogOpen(false)}>Cancelar</Button>
          {currentAgentReactionEmoji && (
            <Button color="warning" onClick={() => handleSubmitReaction('')} disabled={reacting}>
              Quitar
            </Button>
          )}
          <Button
            variant="contained"
            onClick={() => handleSubmitReaction(reactionValue)}
            disabled={reacting || !reactionValue.trim()}
          >
            Enviar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.severity} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.message}
        </Alert>
      </Snackbar>

      {/* Lightbox */}
      <Dialog open={Boolean(lightboxUrl)} onClose={() => setLightboxUrl(null)} maxWidth="lg" PaperProps={{ sx: { bgcolor: 'transparent', boxShadow: 'none', overflow: 'visible' } }}>
        <DialogContent sx={{ p: 0, position: 'relative', display: 'flex', justifyContent: 'center' }}>
          <IconButton onClick={() => setLightboxUrl(null)} sx={{ position: 'absolute', top: -40, right: 0, color: '#fff' }}>
            <CloseIcon />
          </IconButton>
          {lightboxUrl && (
            <Box sx={{ position: 'relative' }}>
              <img src={lightboxUrl} alt="Vista completa" style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 8 }} />
              <IconButton
                onClick={() => { if (lightboxUrl) downloadMediaBlob(lightboxUrl, `imagen-${Date.now()}.jpg`); }}
                sx={{ position: 'absolute', bottom: 8, right: 8, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' } }}
              >
                <DownloadIcon />
              </IconButton>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MessageBubble;
