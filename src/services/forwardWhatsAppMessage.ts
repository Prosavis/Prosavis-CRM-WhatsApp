import {
  getMediaUrl,
  sendMedia,
  sendMessage,
  type WhatsAppContact,
  type WhatsAppLocation,
  type WhatsAppMessage,
  type WhatsAppOutboundMediaType,
} from '@/services/whatsappService';

export interface ForwardWhatsAppResult {
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ messageId: string; error: string }>;
}

const FORWARDABLE_MEDIA_TYPES = new Set<WhatsAppOutboundMediaType>([
  'image',
  'audio',
  'video',
  'document',
  'sticker',
]);

function getContactDisplayName(contact: WhatsAppContact): string {
  return (
    contact.name?.formatted_name ||
    [contact.name?.first_name, contact.name?.last_name].filter(Boolean).join(' ') ||
    'Contacto'
  );
}

/** Texto plano reenviable (misma lógica que copyablePlainText en MessageBubble). */
export function getForwardablePlainText(message: WhatsAppMessage): string {
  const hasMedia = Boolean(message.mediaType);
  const hasLocation = Boolean(message.location);
  const hasContacts = Boolean(message.contacts?.length);

  const caption = message.caption || '';
  const body = message.messageBody || '';
  const bodyIsMediaTag = body.startsWith('[');
  const displayText = hasMedia && caption ? caption : bodyIsMediaTag ? '' : body;
  const showTextBody = Boolean(displayText);

  if (showTextBody) return displayText.trim();
  if (!hasMedia && !hasLocation && !hasContacts && body) return body.trim();
  if (caption.trim()) return caption.trim();
  return '';
}

function formatLocationText(location: WhatsAppLocation): string {
  const { latitude, longitude, name, address } = location;
  const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
  const lines = ['📍 Ubicación compartida'];
  if (name) lines.push(name);
  if (address) lines.push(address);
  lines.push(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
  lines.push(mapsUrl);
  return lines.join('\n');
}

function formatContactsText(contacts: WhatsAppContact[]): string {
  const lines = ['👤 Contacto(s) compartido(s)'];
  for (const contact of contacts) {
    lines.push(`\n${getContactDisplayName(contact)}`);
    for (const phone of contact.phones ?? []) {
      if (phone.phone) {
        lines.push(`  ${phone.phone}${phone.type ? ` (${phone.type})` : ''}`);
      }
    }
    if (contact.org?.company) {
      lines.push(`  ${contact.org.company}`);
    }
  }
  return lines.join('\n');
}

export function isForwardableMessage(message: WhatsAppMessage): boolean {
  if (message.reactionTo) return false;
  if (message.templateName) return false;
  if (message.senderType === 'system') return false;

  if (message.mediaType && FORWARDABLE_MEDIA_TYPES.has(message.mediaType)) {
    return Boolean(message.storagePath || message.mediaId || message.mediaUrl || message.storageUrl);
  }
  if (message.location) return true;
  if (message.contacts?.length) return true;

  return Boolean(getForwardablePlainText(message));
}

export async function forwardWhatsAppMessage(
  message: WhatsAppMessage,
  destinationStableKey: string,
  phoneNumberId?: string,
  sourceStableKeyHint?: string,
): Promise<void> {
  const mediaType = message.mediaType;
  if (mediaType && FORWARDABLE_MEDIA_TYPES.has(mediaType)) {
    const storagePath = message.storagePath;
    let mediaUrl =
      message.storageUrl || message.mediaUrl || (storagePath ? `wa://${storagePath}` : '');
    let mimeType = message.mimeType;
    let sizeBytes = message.sizeBytes;

    if (!storagePath && message.mediaId) {
      const resolved = await getMediaUrl(message.mediaId, {
        storagePath: message.storagePath,
        stableKeyHint: sourceStableKeyHint,
        mimeType: message.mimeType,
      });
      mediaUrl = resolved.url;
      mimeType = resolved.mimeType ?? mimeType;
      sizeBytes = resolved.fileSize ?? sizeBytes;
    }

    if (!mediaUrl && !storagePath) {
      throw new Error('No se pudo resolver el archivo multimedia para reenviar.');
    }

    await sendMedia(destinationStableKey, mediaType, mediaUrl || `wa://${storagePath}`, {
      caption: message.caption || undefined,
      filename: message.filename || undefined,
      phoneNumberId,
      storagePath: storagePath || undefined,
      mimeType,
      sizeBytes,
    });
    return;
  }

  if (message.location) {
    await sendMessage(
      destinationStableKey,
      formatLocationText(message.location),
      phoneNumberId,
    );
    return;
  }

  if (message.contacts?.length) {
    await sendMessage(
      destinationStableKey,
      formatContactsText(message.contacts),
      phoneNumberId,
    );
    return;
  }

  const text = getForwardablePlainText(message);
  if (!text) {
    throw new Error('El mensaje no tiene contenido reenviable.');
  }

  await sendMessage(destinationStableKey, text, phoneNumberId);
}

export async function forwardWhatsAppMessages(
  messages: WhatsAppMessage[],
  destinationStableKey: string,
  options?: {
    phoneNumberId?: string;
    sourceStableKeyHint?: string;
    onProgress?: (current: number, total: number) => void;
  },
): Promise<ForwardWhatsAppResult> {
  const forwardable = messages
    .filter(isForwardableMessage)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const skipped = messages.length - forwardable.length;

  if (forwardable.length === 0) {
    throw new Error('Ninguno de los mensajes seleccionados se puede reenviar.');
  }

  let sent = 0;
  let failed = 0;
  const errors: Array<{ messageId: string; error: string }> = [];

  for (let i = 0; i < forwardable.length; i++) {
    const msg = forwardable[i];
    options?.onProgress?.(i + 1, forwardable.length);
    try {
      await forwardWhatsAppMessage(
        msg,
        destinationStableKey,
        options?.phoneNumberId,
        options?.sourceStableKeyHint,
      );
      sent++;
    } catch (err) {
      failed++;
      errors.push({
        messageId: msg.id,
        error: err instanceof Error ? err.message : 'Error al reenviar',
      });
    }
  }

  return { sent, failed, skipped, errors };
}
