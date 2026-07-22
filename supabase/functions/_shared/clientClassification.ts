/**
 * Clasificación de clientes (Empresas / recurrente / agendado).
 * Alineado con Prosavis-UserConsole/src/utils/clientClassification.ts
 */

const EMPRESAS_TOKENS = new Set(['empresas', 'empresa', 'company']);
const RECURRING_CLIENT_KEYWORDS = ['cliente recurrente', 'recurrente'];
const AGENDADO_KEYWORDS = ['agendado', 'agendada'];
/** Tags que marcan lista negra: Decline, 🚫, Bloqueado. */
const BLACKLIST_TOKENS = new Set(['decline', '🚫', 'bloqueado']);
/** Tag TEST = admins/ingenieros; excluir de métricas. */
const TEST_TOKENS = new Set(['test']);
/** Tag Favoritos = acceso rápido preferido en métricas. */
const FAVORITOS_TOKENS = new Set(['favoritos', 'favorito']);

function splitTokens(value: string): string[] {
  return value
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function isEmpresasToken(token: string): boolean {
  return EMPRESAS_TOKENS.has(token);
}

export type ClassifiableClient = {
  classification?: string | null;
  tags?: string[] | null;
};

function hasExactToken(
  client: ClassifiableClient,
  tokens: Set<string>,
): boolean {
  if (client.classification) {
    const parts = splitTokens(client.classification);
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

export function isCompanyClient(client: ClassifiableClient): boolean {
  const classification = client.classification ?? null;

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

export function isRecurringClient(client: ClassifiableClient): boolean {
  const classification = client.classification ?? null;

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

export function hasAgendadoTag(client: ClassifiableClient): boolean {
  if (client.classification) {
    const classificationLower = client.classification.toLowerCase();
    if (AGENDADO_KEYWORDS.some((kw) => classificationLower.includes(kw))) return true;
    const tokens = splitTokens(client.classification);
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
