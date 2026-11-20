/** Piezas vivas de Promo Octubre · WhatsApp. Un id desconocido sigue mostrando titular e imagen. */
const AD_NAMES: Readonly<Record<string, string>> = {
  '120250397331720691': 'Glamping',
  '120250397333590691': 'Cerritos clara',
  '120250397337640691': 'Joven lujo',
  '120250397340930691': 'Señora',
};

export interface CtwaAdPreview {
  sourceId: string;
  name?: string;
  headline?: string;
  body?: string;
  imageUrl?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function ctwaAdName(sourceId: string | null | undefined): string | undefined {
  const id = String(sourceId || '').trim();
  return id ? AD_NAMES[id] : undefined;
}

function isMetaCdnHost(hostname: string): boolean {
  return /(?:^|\.)fbcdn\.net$/i.test(hostname) || hostname.toLowerCase() === 'lookaside.fbsbx.com';
}

/**
 * URL de miniatura que el navegador puede pedir.
 * Las de Meta caducan en `oe` (unix, hex). Una vencida responde 403.
 */
export function usableAdImageUrl(url: string | undefined, nowMs = Date.now()): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (!isMetaCdnHost(parsed.hostname)) return trimmed;
  const oe = parsed.searchParams.get('oe');
  if (!oe || !/^[0-9a-f]+$/i.test(oe)) return undefined;
  const expiresMs = Number.parseInt(oe, 16) * 1000;
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return undefined;
  return trimmed;
}

/** Referral de un mensaje inbound (`raw_payload.referral`). Sin clic de anuncio, null. */
export function ctwaAdPreviewFromPayload(payload: unknown): CtwaAdPreview | null {
  const message = asRecord(payload);
  const referral = asRecord(message?.referral);
  if (!referral) return null;
  const sourceType = asText(referral.source_type);
  if (sourceType && sourceType !== 'ad') return null;
  const sourceId = asText(referral.source_id);
  if (!sourceId) return null;
  return {
    sourceId,
    name: ctwaAdName(sourceId),
    headline: asText(referral.headline),
    body: asText(referral.body),
    imageUrl: usableAdImageUrl(asText(referral.image_url)),
  };
}

export interface MenuButton {
  id: string;
  title: string;
}

/** Botones que se mandaron con el menú, guardados en `raw_payload.menu_buttons`. */
export function menuButtonsFromPayload(payload: unknown): MenuButton[] {
  const record = asRecord(payload);
  const raw = record?.menu_buttons;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const button = asRecord(item);
    const id = asText(button?.id);
    const title = asText(button?.title);
    if (!id || !title) return [];
    return [{ id, title }];
  });
}
