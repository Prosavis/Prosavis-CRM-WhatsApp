/**
 * Cobertura geográfica oficial de Prosavis Limpieza (servicio directo).
 * Debe coincidir con `DEFAULT_COVERAGE_ZONES` en
 * `prosavis-firebase/functions/src/cleaning/prosavisCleaningCoverage.ts`.
 * Sede: Google Business Profile "Prosavis Limpieza".
 */

export const COVERAGE_CATALOG_HEADING =
  '=== Cobertura oficial de servicios (fuente de verdad) ===';

export const OFFICIAL_BUSINESS_NAME = 'Prosavis Limpieza';

export const OFFICIAL_BUSINESS_ADDRESS =
  'Cra. 23 #85-13 Manzana 5 Casa 17, Pereira, Risaralda';

export const OFFICIAL_MAPS_URL = 'https://maps.app.goo.gl/xnKEMBYy6T3KuCAL8';

export const DIRECT_COVERAGE_ZONES = [
  'Pereira',
  'Dosquebradas',
  'Cerritos',
] as const;

export const MANUAL_REVIEW_COVERAGE_ZONES = [
  'Santa Rosa de Cabal',
] as const;

export const OUT_OF_COVERAGE_EXAMPLE_CITIES = [
  'Bogotá',
  'Cali',
  'Medellín',
] as const;

export function formatCoverageCatalogBlock(): string {
  return [
    COVERAGE_CATALOG_HEADING,
    `Sede ${OFFICIAL_BUSINESS_NAME}: ${OFFICIAL_BUSINESS_ADDRESS}`,
    `Mapa: ${OFFICIAL_MAPS_URL}`,
    'Si preguntan dónde están ubicados, da esta sede en Pereira. No inventes otra ciudad ni otra dirección.',
    'Cobertura de servicio a domicilio:',
    ...DIRECT_COVERAGE_ZONES.map((zone) => `- ${zone} — cobertura directa`),
    ...MANUAL_REVIEW_COVERAGE_ZONES.map(
      (zone) =>
        `- ${zone} — se puede agendar; puede requerir confirmación operativa`,
    ),
    `No hay cobertura de limpieza directa en ${OUT_OF_COVERAGE_EXAMPLE_CITIES.join(', ')} ni en otras ciudades fuera de estas zonas.`,
    'Si preguntan si atienden en su sector, usa solo estas zonas y pide dirección o barrio para confirmar.',
    'Si una FAQ o snippet menciona otra ciudad, ignórala: esta sección prevalece.',
  ].join('\n');
}
