export type MediaType = 'image' | 'audio' | 'video' | 'document' | 'sticker';

/** MIME por defecto cuando Storage/cliente no envían content-type. */
export function defaultMimeForMediaType(mediaType: MediaType): string {
  switch (mediaType) {
    case 'image':
      return 'image/jpeg';
    case 'audio':
      return 'audio/ogg';
    case 'video':
      return 'video/mp4';
    case 'document':
      return 'application/octet-stream';
    case 'sticker':
      return 'image/webp';
    default: {
      const _exhaustive: never = mediaType;
      return _exhaustive;
    }
  }
}

/**
 * Payload de media para Graph Messages.
 * Preferir `id` (upload directo): Meta no descarga weblinks de Storage de forma fiable
 * (error 131053 / "Downloading media from weblink failed with http code 500").
 */
export function buildOutboundMediaPayload(params: {
  mediaType: MediaType;
  mediaId?: string;
  mediaUrl?: string;
  caption?: string;
  filename?: string;
}): Record<string, unknown> {
  const mediaId = params.mediaId?.trim();
  const mediaUrl = params.mediaUrl?.trim();
  if (!mediaId && !mediaUrl) {
    throw new Error('Se requiere mediaId o mediaUrl para enviar media.');
  }

  const mediaPayload: Record<string, unknown> = mediaId
    ? { id: mediaId }
    : { link: mediaUrl };

  if (
    params.caption &&
    (params.mediaType === 'image' ||
      params.mediaType === 'video' ||
      params.mediaType === 'document')
  ) {
    mediaPayload.caption = params.caption;
  }
  if (params.mediaType === 'document' && params.filename) {
    mediaPayload.filename = params.filename;
  }
  return mediaPayload;
}
