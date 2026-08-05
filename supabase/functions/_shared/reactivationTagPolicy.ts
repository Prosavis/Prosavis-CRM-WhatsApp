/**
 * Política de tags para reactivación WhatsApp.
 *
 * No enviar si:
 * - Lista negra / Decline / bloqueados
 * - Equipo / Auxiliares / Trabajo-CV
 * - TEST / Empresas / problemáticos / no priorizar
 * - Tag de ciudad/región fuera de cobertura operativa
 *
 * Cobertura operativa (ciudad): Pereira, Dosquebradas, Santa Rosa.
 * Sin tag de ciudad → se permite (la mayoría local no lleva ciudad).
 * Con tag de ciudad permitida → se permite.
 * Con tag de ciudad NO permitida → se excluye.
 */

export const REACTIVATION_ALLOWED_CITY_TAGS = [
  'pereira',
  'dosquebradas',
  'dos quebradas',
  'santa rosa',
  'santa rosa de cabal',
] as const;

/** Ciudades/regiones conocidas fuera de la cobertura de reactivación. */
export const REACTIVATION_OUT_OF_COVERAGE_CITY_TAGS = [
  'fuera de cobertura',
  'bogotá',
  'bogota',
  'quindío',
  'quindio',
  'armenia',
  'cartago',
  'medellín',
  'medellin',
  'cali',
  'barranquilla',
  'manizales',
  'ibagué',
  'ibague',
  'cerritos',
] as const;

/** Tags duros: nunca reactivar. */
export const REACTIVATION_HARD_EXCLUDE_TAGS = [
  // Lista negra
  'decline',
  'bloqueado',
  '🚫',
  // Equipo / internos
  'auxiliares',
  'auxiliar',
  'auxiliares desactivadas',
  'marian',
  'job',
  'jobs',
  'francy',
  'entrevista',
  'trabajo',
  'trabajo / cv',
  'trabajo/cv',
  // Pruebas / B2B / calidad
  'test',
  'empresas',
  'empresa',
  'company',
  'cliente problemática',
  'cliente problematica',
  'no priorizar',
] as const;

function normalizeTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

function collectTokens(
  tags: string[] | null | undefined,
  classification?: string | null,
): string[] {
  const out: string[] = [];
  if (classification) {
    for (const part of classification.split(',')) {
      const n = normalizeTag(part);
      if (n) out.push(n);
    }
  }
  if (tags) {
    for (const tag of tags) {
      if (!tag) continue;
      if (tag.includes(',')) {
        for (const part of tag.split(',')) {
          const n = normalizeTag(part);
          if (n) out.push(n);
        }
      } else {
        const n = normalizeTag(tag);
        if (n) out.push(n);
      }
    }
  }
  return out;
}

const HARD_EXCLUDE = new Set(
  REACTIVATION_HARD_EXCLUDE_TAGS.map((t) => normalizeTag(t)),
);
const ALLOWED_CITY = new Set(
  REACTIVATION_ALLOWED_CITY_TAGS.map((t) => normalizeTag(t)),
);
const OUT_OF_COVERAGE = new Set(
  REACTIVATION_OUT_OF_COVERAGE_CITY_TAGS.map((t) => normalizeTag(t)),
);

/** True si el token parece una ciudad/región de cobertura (permitida o no). */
function isCoverageGeographyTag(token: string): boolean {
  return ALLOWED_CITY.has(token) || OUT_OF_COVERAGE.has(token);
}

export type ReactivationTagSkipReason =
  | 'tag_blacklist'
  | 'tag_team'
  | 'tag_test'
  | 'tag_company'
  | 'tag_quality'
  | 'tag_out_of_coverage'
  | 'tag_excluded';

export function getReactivationTagSkipReason(options: {
  tags?: string[] | null;
  classification?: string | null;
}): ReactivationTagSkipReason | null {
  const tokens = collectTokens(options.tags, options.classification);
  if (!tokens.length) return null;

  for (const token of tokens) {
    if (token === 'decline' || token === 'bloqueado' || token === '🚫') {
      return 'tag_blacklist';
    }
    if (
      token === 'auxiliares' ||
      token === 'auxiliar' ||
      token === 'auxiliares desactivadas' ||
      token === 'marian' ||
      token === 'job' ||
      token === 'jobs' ||
      token === 'francy' ||
      token === 'entrevista' ||
      token === 'trabajo' ||
      token === 'trabajo / cv' ||
      token === 'trabajo/cv'
    ) {
      return 'tag_team';
    }
    if (token === 'test') return 'tag_test';
    if (token === 'empresas' || token === 'empresa' || token === 'company') {
      return 'tag_company';
    }
    if (
      token === 'cliente problemática' ||
      token === 'cliente problematica' ||
      token === 'no priorizar'
    ) {
      return 'tag_quality';
    }
    if (HARD_EXCLUDE.has(token)) return 'tag_excluded';
  }

  // Ciudad/región explícita fuera de Pereira / Dosquebradas / Santa Rosa.
  const geoTags = tokens.filter(isCoverageGeographyTag);
  if (geoTags.length > 0) {
    const hasAllowed = geoTags.some((t) => ALLOWED_CITY.has(t));
    const hasForbidden = geoTags.some((t) => OUT_OF_COVERAGE.has(t));
    // Si solo tiene ciudades permitidas → ok.
    // Si tiene alguna fuera de cobertura → excluir (aunque también tenga Santa Rosa).
    if (hasForbidden) return 'tag_out_of_coverage';
    if (!hasAllowed && geoTags.length > 0) return 'tag_out_of_coverage';
  }

  return null;
}

export function shouldSkipReactivationByTags(options: {
  tags?: string[] | null;
  classification?: string | null;
}): boolean {
  return getReactivationTagSkipReason(options) != null;
}
