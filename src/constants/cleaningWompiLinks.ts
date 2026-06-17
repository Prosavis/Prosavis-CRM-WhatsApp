/**
 * Links Wompi estáticos por monto COP.
 * Tarifas activas 88k/118k/148k + legacy para cobros históricos.
 */
export const CLEANING_WOMPI_LINKS_BY_AMOUNT_COP: Record<number, string> = {
  58000: 'https://checkout.wompi.co/l/vackSo',
  78000: 'https://checkout.wompi.co/l/qbZ4v6',
  88000: 'https://checkout.wompi.co/l/6WXkiC',
  98000: 'https://checkout.wompi.co/l/PCqnR6',
  118000: 'https://checkout.wompi.co/l/81hFzU',
  128000: 'https://checkout.wompi.co/l/7pDNne',
  148000: 'https://checkout.wompi.co/l/ZdMwo3',
  168000: 'https://checkout.wompi.co/l/8P1bOC',
};

export function getStaticCleaningWompiUrl(amountCOP: number): string | null {
  return CLEANING_WOMPI_LINKS_BY_AMOUNT_COP[Math.round(amountCOP)] ?? null;
}

/**
 * Links Wompi con Kit profesional, indexados por precio BASE de la duración
 * (el total cobrado incluye +30k del kit). Espejo del backend.
 */
export const CLEANING_KIT_WOMPI_LINKS_BY_BASE_COP: Record<number, string> = {
  88000: 'https://checkout.wompi.co/l/x1dbS7',
  118000: 'https://checkout.wompi.co/l/PVxkjb',
  148000: 'https://checkout.wompi.co/l/QJugIg',
};

export function getStaticCleaningKitWompiUrl(basePriceCOP: number): string | null {
  return CLEANING_KIT_WOMPI_LINKS_BY_BASE_COP[Math.round(basePriceCOP)] ?? null;
}
