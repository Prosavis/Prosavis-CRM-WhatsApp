/**
 * Utilidades para determinar si un cliente es empresa / recurrente / agendado.
 * Portado desde Prosavis-UserConsole (fuente de verdad: tags WhatsApp).
 */

export const EMPRESAS_TAG_NAME = 'Empresas';
export const FAVORITOS_TAG_NAME = 'Favoritos';

const EMPRESAS_TOKENS = new Set(['empresas', 'empresa', 'company']);
/** Tags que marcan lista negra: Decline, 🚫, Bloqueado. */
const BLACKLIST_TOKENS = new Set(['decline', '🚫', 'bloqueado']);
/** Tag TEST = admins/ingenieros; excluir de métricas. */
const TEST_TOKENS = new Set(['test']);
/** Tag Favoritos = acceso rápido preferido en métricas. */
const FAVORITOS_TOKENS = new Set(['favoritos', 'favorito']);

export const DIRECTORY_LEGACY_LABELS: Record<string, string> = {
  company: 'Empresa',
  user: 'Usuario',
  lead: 'Prospecto',
  unknown: 'Sin clasificar',
  agendado: 'Agendado',
};

function splitTokens(value: string): string[] {
  return value
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function isEmpresasToken(token: string): boolean {
  return EMPRESAS_TOKENS.has(token);
}

export function isCompanyClient(client: {
  clientClassification?: string | null;
  classification?: string | null;
  tags?: string[] | null;
}): boolean {
  const classification =
    client.clientClassification ?? client.classification ?? null;

  if (classification) {
    const tokens = splitTokens(classification);
    if (tokens.some(isEmpresasToken)) return true;
  }

  if (client.tags && Array.isArray(client.tags) && client.tags.length > 0) {
    for (const tag of client.tags) {
      if (!tag) continue;
      const trimmed = tag.trim().toLowerCase();
      if (isEmpresasToken(trimmed)) return true;
      if (tag.includes(',')) {
        const subTokens = splitTokens(tag);
        if (subTokens.some(isEmpresasToken)) return true;
      }
    }
  }

  return false;
}

const RECURRING_CLIENT_KEYWORDS = ['cliente recurrente', 'recurrente'];

export function isRecurringClient(client: {
  clientClassification?: string | null;
  classification?: string | null;
  tags?: string[] | null;
}): boolean {
  const classification =
    client.clientClassification ?? client.classification ?? null;

  if (classification) {
    const classificationLower = classification.toLowerCase();
    if (RECURRING_CLIENT_KEYWORDS.some((kw) => classificationLower.includes(kw))) {
      return true;
    }
    const tokens = splitTokens(classification);
    if (tokens.some((t) => t === 'recurrente')) return true;
  }

  if (client.tags && Array.isArray(client.tags) && client.tags.length > 0) {
    for (const tag of client.tags) {
      if (!tag) continue;
      const trimmed = tag.trim().toLowerCase();
      if (RECURRING_CLIENT_KEYWORDS.some((kw) => trimmed.includes(kw))) return true;
      if (tag.includes(',')) {
        const subTokens = splitTokens(tag);
        if (subTokens.some((t) => t === 'recurrente')) return true;
      }
    }
  }

  return false;
}

const AGENDADO_KEYWORDS = ['agendado', 'agendada'];

export function hasAgendadoTag(client: {
  clientClassification?: string | null;
  classification?: string | null;
  tags?: string[] | null;
}): boolean {
  const classification =
    client.clientClassification ?? client.classification ?? null;

  if (classification) {
    const classificationLower = classification.toLowerCase();
    if (AGENDADO_KEYWORDS.some((kw) => classificationLower.includes(kw))) return true;
    const tokens = splitTokens(classification);
    if (tokens.some((t) => AGENDADO_KEYWORDS.includes(t))) return true;
  }

  if (client.tags && Array.isArray(client.tags) && client.tags.length > 0) {
    for (const tag of client.tags) {
      if (!tag) continue;
      const trimmed = tag.trim().toLowerCase();
      if (AGENDADO_KEYWORDS.some((kw) => trimmed.includes(kw))) return true;
      if (tag.includes(',')) {
        const subTokens = splitTokens(tag);
        if (subTokens.some((t) => AGENDADO_KEYWORDS.includes(t))) return true;
      }
    }
  }

  return false;
}

type ClassifiableClient = {
  clientClassification?: string | null;
  classification?: string | null;
  tags?: string[] | null;
};

function hasExactToken(client: ClassifiableClient, tokens: Set<string>): boolean {
  const classification =
    client.clientClassification ?? client.classification ?? null;

  if (classification) {
    const parts = splitTokens(classification);
    if (parts.some((t) => tokens.has(t))) return true;
  }

  if (client.tags && Array.isArray(client.tags) && client.tags.length > 0) {
    for (const tag of client.tags) {
      if (!tag) continue;
      const trimmed = tag.trim().toLowerCase();
      if (tokens.has(trimmed)) return true;
      if (tag.includes(',')) {
        const subTokens = splitTokens(tag);
        if (subTokens.some((t) => tokens.has(t))) return true;
      }
    }
  }

  return false;
}

/** Decline / 🚫 / Bloqueado en tags o classification. */
export function hasBlacklistTag(client: ClassifiableClient): boolean {
  return hasExactToken(client, BLACKLIST_TOKENS);
}

/** Contacto de prueba (admins/devs); excluir de métricas. */
export function isTestContact(client: ClassifiableClient): boolean {
  return hasExactToken(client, TEST_TOKENS);
}

/** Tag Favoritos / Favorito en tags o classification. */
export function hasFavoritosTag(client: ClassifiableClient): boolean {
  return hasExactToken(client, FAVORITOS_TOKENS);
}

export function getClassificationLabel(classification?: string | null): string {
  if (!classification) return 'Usuario';

  const tags = classification.split(',').map((t) => t.trim()).filter(Boolean);
  if (tags.length > 1) {
    return classification;
  }

  const lower = classification.toLowerCase().trim();

  if (isEmpresasToken(lower)) return 'Empresa';
  if (lower === 'lead') return DIRECTORY_LEGACY_LABELS.lead;
  if (lower === 'user') return DIRECTORY_LEGACY_LABELS.user;
  if (lower === 'unknown') return DIRECTORY_LEGACY_LABELS.unknown;
  if (lower === 'agendado') return DIRECTORY_LEGACY_LABELS.agendado;

  return classification;
}
