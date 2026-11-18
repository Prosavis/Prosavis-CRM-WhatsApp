import { Image } from 'https://deno.land/x/imagescript@1.2.17/mod.ts';

const CONVERTIBLE = new Set(['image/gif', 'image/bmp', 'image/x-ms-bmp', 'image/tiff', 'image/tif']);

function baseMime(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

/**
 * GIF, BMP y TIFF se convierten a PNG dentro de la Edge.
 * AVIF y SVG se leen desde el Hub, donde sharp sí los rasteriza.
 */
export async function maybeConvertInboundImage(
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const mime = baseMime(mimeType);
  if (mime === 'image/avif' || mime === 'image/svg+xml') {
    throw new Error('Ábrelo desde el Hub.');
  }
  if (!CONVERTIBLE.has(mime)) return { bytes, mimeType: mime || mimeType };
  try {
    const image = await Image.decode(bytes);
    const png = await image.encode();
    return { bytes: png, mimeType: 'image/png' };
  } catch {
    throw new Error('Ábrelo desde el Hub.');
  }
}
