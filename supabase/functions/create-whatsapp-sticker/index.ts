import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import {
  ANIMATED_STICKER_MAX_BYTES,
  formatError,
  STATIC_STICKER_MAX_BYTES,
} from '../_shared/whatsappOutbound.ts';

const MAX_STICKER_NAME_LENGTH = 80;

function assertStickerPayload(params: {
  name?: string;
  storagePath?: string;
  downloadUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  isAnimated?: boolean;
}) {
  const name = (params.name || '').trim();
  const storagePath = (params.storagePath || '').trim();
  const downloadUrl = (params.downloadUrl || '').trim();
  const mimeType = (params.mimeType || '').trim().toLowerCase();
  const sizeBytes = Number(params.sizeBytes);
  const isAnimated = params.isAnimated === true;

  if (!name || name.length > MAX_STICKER_NAME_LENGTH) {
    throw new Error(`Nombre requerido (máx ${MAX_STICKER_NAME_LENGTH} caracteres).`);
  }
  if (!storagePath.toLowerCase().endsWith('.webp')) {
    throw new Error('El sticker debe tener extensión .webp.');
  }
  if (!storagePath.startsWith('whatsapp-stickers/')) {
    throw new Error('storagePath inválido para stickers.');
  }
  if (!downloadUrl.startsWith('https://')) {
    throw new Error('downloadUrl inválido.');
  }
  if (mimeType !== 'image/webp') {
    throw new Error('El sticker debe ser image/webp.');
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error('Tamaño inválido para sticker.');
  }
  const maxBytes = isAnimated ? ANIMATED_STICKER_MAX_BYTES : STATIC_STICKER_MAX_BYTES;
  if (sizeBytes > maxBytes) {
    throw new Error(
      isAnimated ? 'El sticker animado supera 500 KB.' : 'El sticker estático supera 100 KB.',
    );
  }

  return { name, storagePath, downloadUrl, sizeBytes, isAnimated };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const payload = assertStickerPayload({
      name: body.name,
      storagePath: body.storagePath,
      downloadUrl: body.downloadUrl,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
      isAnimated: body.isAnimated,
    });

    const { data, error } = await supabase
      .from('whatsapp_stickers')
      .insert({
        name: payload.name,
        storage_path: payload.storagePath,
        download_url: payload.downloadUrl,
        mime_type: 'image/webp',
        size_bytes: payload.sizeBytes,
        is_animated: payload.isAnimated,
        created_by: user.id,
        archived: false,
        favorite_by_uids: [],
      })
      .select('id')
      .single();

    if (error) throw error;
    return jsonResponse({ success: true, id: data.id });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 400);
  }
});
