/** Límites de Meta Cloud API para stickers WhatsApp. */
export const STATIC_STICKER_MAX_BYTES = 100 * 1024;
export const ANIMATED_STICKER_MAX_BYTES = 500 * 1024;

const STICKER_MAX_EDGE = 512;
const QUALITY_STEPS = [0.92, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25, 0.15];
const EDGE_STEPS = [512, 448, 384, 320, 256, 192, 160, 128];

export async function detectAnimatedWebp(file: File): Promise<boolean> {
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

function canvasToWebpBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No se pudo codificar el sticker como WebP'));
          return;
        }
        resolve(blob);
      },
      'image/webp',
      quality,
    );
  });
}

function drawScaled(
  source: ImageBitmap | HTMLImageElement,
  maxEdge: number,
): HTMLCanvasElement {
  const srcW = 'width' in source ? source.width : (source as HTMLImageElement).naturalWidth;
  const srcH = 'height' in source ? source.height : (source as HTMLImageElement).naturalHeight;
  const scale = Math.min(1, maxEdge / Math.max(srcW, srcH, 1));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo preparar el canvas para comprimir el sticker');
  }
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function compressStaticWebp(file: File, maxBytes: number): Promise<File> {
  if (file.size <= maxBytes) return file;

  const bitmap = await createImageBitmap(file);
  try {
    for (const edge of EDGE_STEPS) {
      const canvas = drawScaled(bitmap, Math.min(edge, STICKER_MAX_EDGE));
      for (const quality of QUALITY_STEPS) {
        const blob = await canvasToWebpBlob(canvas, quality);
        if (blob.size <= maxBytes) {
          const baseName = file.name.replace(/\.webp$/i, '') || 'sticker';
          return new File([blob], `${baseName}.webp`, {
            type: 'image/webp',
            lastModified: Date.now(),
          });
        }
      }
    }
  } finally {
    bitmap.close();
  }

  throw new Error(
    'No se pudo comprimir el sticker bajo 100 KB. Prueba con una imagen más simple.',
  );
}

export interface PreparedWhatsAppSticker {
  file: File;
  isAnimated: boolean;
  wasCompressed: boolean;
}

/**
 * Valida y, si hace falta, comprime un .webp para cumplir límites de Meta
 * (estático ≤100 KB, animado ≤500 KB). Los estáticos grandes se reescalan
 * automáticamente; los animados no se pueden recomprimir en el navegador.
 */
export async function prepareWhatsAppSticker(file: File): Promise<PreparedWhatsAppSticker> {
  const isWebp = file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp');
  if (!isWebp) {
    throw new Error('Solo se permiten stickers .webp');
  }

  const isAnimated = await detectAnimatedWebp(file);
  const maxBytes = isAnimated ? ANIMATED_STICKER_MAX_BYTES : STATIC_STICKER_MAX_BYTES;

  if (file.size <= maxBytes) {
    return { file, isAnimated, wasCompressed: false };
  }

  if (isAnimated) {
    throw new Error(
      'El sticker animado supera 500 KB y no se puede comprimir automáticamente. Usa un .webp animado más liviano.',
    );
  }

  const compressed = await compressStaticWebp(file, maxBytes);
  return { file: compressed, isAnimated: false, wasCompressed: true };
}
