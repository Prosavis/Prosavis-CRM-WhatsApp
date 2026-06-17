export const STATIC_WOMPI_LINKS_BY_AMOUNT_COP: Record<number, string> = {
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
  return STATIC_WOMPI_LINKS_BY_AMOUNT_COP[Math.round(amountCOP)] ?? null;
}

export function getStaticCleaningWompiReference(amountCOP: number): string | null {
  const url = getStaticCleaningWompiUrl(amountCOP);
  return url ? url.split('/').pop() ?? null : null;
}

/**
 * Links Wompi con Kit profesional, indexados por precio BASE de la duración
 * (el total cobrado incluye +30k del kit). Necesario para cobros con kit por
 * WhatsApp. Espejo del backend (pricing.ts).
 */
export const STATIC_KIT_WOMPI_LINKS_BY_BASE_COP: Record<number, string> = {
  88000: 'https://checkout.wompi.co/l/x1dbS7',
  118000: 'https://checkout.wompi.co/l/PVxkjb',
  148000: 'https://checkout.wompi.co/l/QJugIg',
};

export function getStaticCleaningKitWompiUrl(basePriceCOP: number): string | null {
  return STATIC_KIT_WOMPI_LINKS_BY_BASE_COP[Math.round(basePriceCOP)] ?? null;
}

export function getStaticCleaningKitWompiReference(basePriceCOP: number): string | null {
  const url = getStaticCleaningKitWompiUrl(basePriceCOP);
  return url ? url.split('/').pop() ?? null : null;
}
