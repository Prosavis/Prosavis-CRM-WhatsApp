type JsonRecord = Record<string, unknown>;

export interface WhatsAppMessageContent {
  messageBody: string | null;
  mediaType: string | null;
  mediaId: string | null;
  caption: string | null;
  mimeType: string | null;
  filename: string | null;
  location: JsonRecord | null;
  contacts: unknown[] | null;
  reactionTo: string | null;
  reactionRemoved: boolean;
  isVoiceNote: boolean;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export const CLOUD_API_REVOKED_LABEL = 'Mensaje eliminado';
export const CLOUD_API_UNSUPPORTED_LEGACY_TAG = '[unsupported]';

function emptyNonMediaContent(messageBody: string | null): WhatsAppMessageContent {
  return {
    messageBody,
    mediaType: null,
    mediaId: null,
    caption: null,
    mimeType: null,
    filename: null,
    location: null,
    contacts: null,
    reactionTo: null,
    reactionRemoved: false,
    isVoiceNote: false,
  };
}

export function unsupportedSubtype(message: JsonRecord): string {
  const nested = asRecord(message.unsupported);
  return getString(nested.type) || getString(nested.raw_type);
}

export function originalMessageIdFromUnsupported(message: JsonRecord): string | null {
  const nested = asRecord(message.unsupported);
  const context = asRecord(message.context);
  const revoke = asRecord(message.revoke);
  return (
    getString(nested.original_message_id) ||
    getString(message.original_message_id) ||
    getString(context.id) ||
    getString(revoke.original_message_id) ||
    null
  );
}

export function humanUnsupportedLabel(subtype: string): string {
  switch (subtype) {
    case 'revoke':
      return CLOUD_API_REVOKED_LABEL;
    case 'edit':
      return 'Mensaje editado — WhatsApp no entrega el texto a la API';
    case 'poll':
    case 'poll_creation':
    case 'poll_update':
      return 'Encuesta — WhatsApp no la entrega a la API';
    case 'interactive':
    case 'button':
    case 'list':
      return 'Mensaje interactivo — WhatsApp no lo entrega a la API';
    case 'order':
    case 'product':
      return 'Pedido — WhatsApp no lo entrega a la API';
    case 'gif':
      return 'GIF — WhatsApp no lo entrega a la API';
    default:
      return subtype
        ? `Tipo ${subtype} — WhatsApp no lo entrega a la API`
        : 'Tipo no soportado por la API de WhatsApp';
  }
}

export type CloudApiUnsupportedDisposition =
  | { kind: 'revoke'; originalMessageId: string | null }
  | { kind: 'labeled' };

export function cloudApiUnsupportedDisposition(
  message: JsonRecord,
): CloudApiUnsupportedDisposition | null {
  if (getString(message.type) !== 'unsupported') return null;
  const subtype = unsupportedSubtype(message);
  if (subtype === 'revoke') {
    return {
      kind: 'revoke',
      originalMessageId: originalMessageIdFromUnsupported(message),
    };
  }
  return { kind: 'labeled' };
}

export function getMessageContent(message: JsonRecord): WhatsAppMessageContent {
  const type = getString(message.type) || 'unknown';

  if (type === 'text') {
    const text = asRecord(message.text);
    return {
      messageBody: getString(text.body) || null,
      mediaType: null,
      mediaId: null,
      caption: null,
      mimeType: null,
      filename: null,
      location: null,
      contacts: null,
      reactionTo: null,
      reactionRemoved: false,
      isVoiceNote: false,
    };
  }

  if (type === 'location') {
    const location = asRecord(message.location);
    return {
      messageBody: getString(location.name) || getString(location.address) || '[ubicación]',
      mediaType: null,
      mediaId: null,
      caption: null,
      mimeType: null,
      filename: null,
      location,
      contacts: null,
      reactionTo: null,
      reactionRemoved: false,
      isVoiceNote: false,
    };
  }

  if (type === 'contacts') {
    const contacts = asArray(message.contacts);
    return {
      messageBody: '[contacto]',
      mediaType: null,
      mediaId: null,
      caption: null,
      mimeType: null,
      filename: null,
      location: null,
      contacts,
      reactionTo: null,
      reactionRemoved: false,
      isVoiceNote: false,
    };
  }

  if (type === 'reaction') {
    const reaction = asRecord(message.reaction);
    const emoji = getString(reaction.emoji);
    return {
      messageBody: emoji,
      mediaType: null,
      mediaId: null,
      caption: null,
      mimeType: null,
      filename: null,
      location: null,
      contacts: null,
      reactionTo: getString(reaction.message_id) || null,
      reactionRemoved: emoji === '',
      isVoiceNote: false,
    };
  }

  if (type === 'unsupported') {
    return emptyNonMediaContent(humanUnsupportedLabel(unsupportedSubtype(message)));
  }

  const supportedMediaTypes = new Set(['image', 'audio', 'video', 'document', 'sticker']);
  if (!supportedMediaTypes.has(type)) {
    return emptyNonMediaContent(`[${type}]`);
  }

  const media = asRecord(message[type]);
  const caption = getString(media.caption) || null;
  const filename = getString(media.filename) || null;

  return {
    messageBody: caption || filename || `[${type}]`,
    mediaType: type,
    mediaId: getString(media.id) || null,
    caption,
    mimeType: getString(media.mime_type) || null,
    filename,
    location: null,
    contacts: null,
    reactionTo: null,
    reactionRemoved: false,
    isVoiceNote: type === 'audio' && media.voice === true,
  };
}

export function messageLogContentFields(content: WhatsAppMessageContent): Record<string, unknown> {
  return {
    message_body: content.messageBody,
    media_type: content.mediaType,
    media_id: content.mediaId,
    caption: content.caption,
    mime_type: content.mimeType,
    filename: content.filename,
    location: content.location,
    contacts: content.contacts,
    reaction_to: content.reactionTo,
    reaction_removed: content.reactionRemoved,
    is_voice_note: content.isVoiceNote,
  };
}
