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

  const supportedMediaTypes = new Set(['image', 'audio', 'video', 'document', 'sticker']);
  if (!supportedMediaTypes.has(type)) {
    return {
      messageBody: `[${type}]`,
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
