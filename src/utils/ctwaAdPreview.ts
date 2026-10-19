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
    imageUrl: asText(referral.image_url),
  };
}
