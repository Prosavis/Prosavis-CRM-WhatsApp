import {
  getStaticCleaningKitWompiReference,
  getStaticCleaningKitWompiUrl,
  getStaticCleaningWompiReference,
  getStaticCleaningWompiUrl,
} from './wompiLinks.ts';
import {
  normalizeBookingContext,
  type NormalizedBookingContext,
} from './bookingContext.ts';

export const PROFESSIONAL_KIT_SURCHARGE_COP = 30_000;

const BASE_PRICE_BY_DURATION_MINUTES: Readonly<Record<number, number>> = {
  120: 58_000,
  180: 78_000,
  240: 88_000,
  360: 118_000,
  480: 148_000,
};

export interface ResolvedDurationPrice {
  basePriceCOP: number;
  kitSurchargeCOP: number;
  totalCOP: number;
}

export function resolvePriceForDuration(
  minutes: number | null | undefined,
  withKit: boolean,
): ResolvedDurationPrice | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes)) return null;

  const basePriceCOP = BASE_PRICE_BY_DURATION_MINUTES[minutes];
  if (basePriceCOP == null) return null;

  const kitSurchargeCOP = withKit ? PROFESSIONAL_KIT_SURCHARGE_COP : 0;
  return {
    basePriceCOP,
    kitSurchargeCOP,
    totalCOP: basePriceCOP + kitSurchargeCOP,
  };
}

function formatCOP(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatPricingCatalogBlock(): string {
  const lines = [
    '=== Catálogo oficial de precios (fuente de verdad) ===',
    ...Object.entries(BASE_PRICE_BY_DURATION_MINUTES).map(
      ([minutes, priceCOP]) => `- ${minutes} minutos → COP ${formatCOP(priceCOP)}`,
    ),
    `- Kit profesional → COP ${formatCOP(PROFESSIONAL_KIT_SURCHARGE_COP)} adicionales`,
    'No inventes, estimes ni modifiques estos valores.',
  ];
  return lines.join('\n');
}

interface BookingContextWithPricing {
  collectedData?: unknown;
  wantsKit?: unknown;
  calculatedPrice?: unknown;
  paymentStatus?: unknown;
}

type GroundedBookingPricing<T extends BookingContextWithPricing> =
  Omit<T, 'wantsKit' | 'calculatedPrice'> & {
    wantsKit: boolean;
    calculatedPrice: number | null;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBookingDuration(bookingContext: BookingContextWithPricing): number | null {
  if (!isRecord(bookingContext.collectedData)) return null;
  const duration = bookingContext.collectedData.duration;
  return typeof duration === 'number' ? duration : null;
}

function resolveGroundedBookingPricing<T extends BookingContextWithPricing>(
  bookingContext: T,
): {
  bookingContext: GroundedBookingPricing<T>;
  resolvedPrice: ResolvedDurationPrice | null;
} {
  const wantsKit = bookingContext.wantsKit === true;
  const resolved = resolvePriceForDuration(
    readBookingDuration(bookingContext),
    wantsKit,
  );

  return {
    bookingContext: {
      ...bookingContext,
      wantsKit,
      calculatedPrice: resolved?.totalCOP ?? null,
    },
    resolvedPrice: resolved,
  };
}

export function groundBookingPricing<T extends BookingContextWithPricing>(
  bookingContext: T,
): GroundedBookingPricing<T> {
  return resolveGroundedBookingPricing(bookingContext).bookingContext;
}

export interface BookingPricingCheckoutResult {
  bookingContext: NormalizedBookingContext;
  wompiCheckoutUrl?: string;
  wompiPaymentReference?: string;
  wompiAmountCOP?: number;
}

export function resolveBookingPricingCheckout(
  rawBookingContext: unknown,
  phone: string,
): BookingPricingCheckoutResult {
  const bookingContext = normalizeBookingContext(rawBookingContext, phone);
  const grounded = resolveGroundedBookingPricing(bookingContext);
  const result: BookingPricingCheckoutResult = {
    bookingContext: grounded.bookingContext,
  };

  if (!grounded.resolvedPrice || bookingContext.paymentStatus === 'APPROVED') {
    return result;
  }

  const basePriceCOP = grounded.resolvedPrice.basePriceCOP;
  const url = grounded.bookingContext.wantsKit
    ? getStaticCleaningKitWompiUrl(basePriceCOP)
    : getStaticCleaningWompiUrl(basePriceCOP);
  if (!url) return result;

  const reference = grounded.bookingContext.wantsKit
    ? getStaticCleaningKitWompiReference(basePriceCOP)
    : getStaticCleaningWompiReference(basePriceCOP);

  return {
    ...result,
    wompiCheckoutUrl: url,
    ...(reference ? { wompiPaymentReference: reference } : {}),
    wompiAmountCOP: grounded.resolvedPrice.totalCOP,
  };
}
