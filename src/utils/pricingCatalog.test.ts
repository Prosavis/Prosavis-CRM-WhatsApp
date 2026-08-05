import { describe, expect, it } from 'vitest';
import {
  formatPricingCatalogBlock,
  groundBookingPricing,
  resolveBookingPricingCheckout,
  resolvePriceForDuration,
} from '../../supabase/functions/_shared/pricingCatalog';

const TEST_PHONE = '573001112233';

function emptyExpectedBookingContext(phone = TEST_PHONE) {
  return {
    stage: 'no_booking',
    collectedData: {
      date: null,
      time: null,
      duration: null,
      address: null,
      addressSource: null,
    },
    missingData: ['fecha', 'hora', 'duración', 'dirección'],
    availableSlots: [],
    paymentStatus: 'none',
    paymentAmount: null,
    wantsKit: false,
    calculatedPrice: null,
    clientInfo: {
      name: null,
      phone,
      email: null,
      address: null,
      city: null,
      isReturningClient: false,
      userId: null,
    },
  };
}

describe('resolvePriceForDuration', () => {
  it.each([
    [120, 58_000],
    [180, 78_000],
    [240, 88_000],
    [360, 118_000],
    [480, 148_000],
  ])('maps %i minutes to the official COP %i base price', (minutes, basePriceCOP) => {
    expect(resolvePriceForDuration(minutes, false)).toEqual({
      basePriceCOP,
      kitSurchargeCOP: 0,
      totalCOP: basePriceCOP,
    });
  });

  it('adds exactly COP 30,000 for the professional kit', () => {
    expect(resolvePriceForDuration(240, true)).toEqual({
      basePriceCOP: 88_000,
      kitSurchargeCOP: 30_000,
      totalCOP: 118_000,
    });
  });

  it.each([0, 150, Number.NaN])('returns null for invalid or unsupported duration %s', (minutes) => {
    expect(resolvePriceForDuration(minutes, false)).toBeNull();
  });
});

describe('formatPricingCatalogBlock', () => {
  it('includes every official duration, price and the kit surcharge', () => {
    const block = formatPricingCatalogBlock();

    expect(block).toContain('120 minutos → COP 58.000');
    expect(block).toContain('180 minutos → COP 78.000');
    expect(block).toContain('240 minutos → COP 88.000');
    expect(block).toContain('360 minutos → COP 118.000');
    expect(block).toContain('480 minutos → COP 148.000');
    expect(block).toContain('Kit profesional → COP 30.000 adicionales');
  });
});

describe('groundBookingPricing', () => {
  it('overwrites a Gemini-invented calculatedPrice with the deterministic total', () => {
    const grounded = groundBookingPricing({
      stage: 'payment_pending',
      collectedData: { duration: 240 },
      wantsKit: true,
      calculatedPrice: 999_999,
    });

    expect(grounded).toEqual({
      stage: 'payment_pending',
      collectedData: { duration: 240 },
      wantsKit: true,
      calculatedPrice: 118_000,
    });
  });

  it('clears a Gemini-invented calculatedPrice when duration is unsupported', () => {
    const grounded = groundBookingPricing({
      collectedData: { duration: 150 },
      wantsKit: false,
      calculatedPrice: 999_999,
    });

    expect(grounded.calculatedPrice).toBeNull();
  });
});

describe('resolveBookingPricingCheckout', () => {
  it('normalizes an empty Gemini response to the complete booking contract', () => {
    expect(resolveBookingPricingCheckout({}, TEST_PHONE)).toEqual({
      bookingContext: emptyExpectedBookingContext(),
    });
  });

  it('does not throw when Gemini omits collectedData', () => {
    expect(resolveBookingPricingCheckout({
      stage: 'info_gathering',
      calculatedPrice: 999_999,
    }, TEST_PHONE)).toEqual({
      bookingContext: {
        ...emptyExpectedBookingContext(),
        stage: 'info_gathering',
      },
    });
  });

  it('does not throw when Gemini returns malformed collectedData', () => {
    expect(resolveBookingPricingCheckout({
      collectedData: 'not-an-object',
      wantsKit: 'yes',
      calculatedPrice: 999_999,
    }, TEST_PHONE)).toEqual({
      bookingContext: emptyExpectedBookingContext(),
    });
  });

  it('normalizes a non-object Gemini response without throwing', () => {
    expect(resolveBookingPricingCheckout(null, TEST_PHONE)).toEqual({
      bookingContext: emptyExpectedBookingContext(),
    });
  });

  it('fills every required field in a partial response without retaining an invented price', () => {
    expect(resolveBookingPricingCheckout({
      collectedData: {
        date: '2026-08-10',
      },
      missingData: ['hora'],
      clientInfo: {
        name: 'Ana',
      },
      calculatedPrice: 999_999,
    }, TEST_PHONE)).toEqual({
      bookingContext: {
        ...emptyExpectedBookingContext(),
        collectedData: {
          ...emptyExpectedBookingContext().collectedData,
          date: '2026-08-10',
        },
        missingData: ['hora'],
        clientInfo: {
          ...emptyExpectedBookingContext().clientInfo,
          name: 'Ana',
        },
      },
    });
  });

  it('routes a normal checkout using basePriceCOP', () => {
    expect(resolveBookingPricingCheckout({
      collectedData: { duration: 240 },
      wantsKit: false,
      paymentStatus: 'PENDING',
    }, TEST_PHONE)).toEqual({
      bookingContext: {
        ...emptyExpectedBookingContext(),
        collectedData: {
          ...emptyExpectedBookingContext().collectedData,
          duration: 240,
        },
        wantsKit: false,
        paymentStatus: 'PENDING',
        calculatedPrice: 88_000,
      },
      wompiCheckoutUrl: 'https://checkout.wompi.co/l/6WXkiC',
      wompiPaymentReference: '6WXkiC',
      wompiAmountCOP: 88_000,
    });
  });

  it('routes a kit checkout using basePriceCOP instead of the kit-inclusive total', () => {
    expect(resolveBookingPricingCheckout({
      collectedData: { duration: 240 },
      wantsKit: true,
      paymentStatus: 'PENDING',
    }, TEST_PHONE)).toEqual({
      bookingContext: {
        ...emptyExpectedBookingContext(),
        collectedData: {
          ...emptyExpectedBookingContext().collectedData,
          duration: 240,
        },
        wantsKit: true,
        paymentStatus: 'PENDING',
        calculatedPrice: 118_000,
      },
      wompiCheckoutUrl: 'https://checkout.wompi.co/l/x1dbS7',
      wompiPaymentReference: 'x1dbS7',
      wompiAmountCOP: 118_000,
    });
  });

  it.each([
    [120, 88_000],
    [180, 108_000],
  ])('keeps pricing but omits the legitimately unavailable kit link for %i minutes', (
    duration,
    totalCOP,
  ) => {
    expect(resolveBookingPricingCheckout({
      collectedData: { duration },
      wantsKit: true,
      paymentStatus: 'PENDING',
    }, TEST_PHONE)).toEqual({
      bookingContext: {
        ...emptyExpectedBookingContext(),
        collectedData: {
          ...emptyExpectedBookingContext().collectedData,
          duration,
        },
        wantsKit: true,
        paymentStatus: 'PENDING',
        calculatedPrice: totalCOP,
      },
    });
  });

  it('does not expose a checkout for an approved payment', () => {
    expect(resolveBookingPricingCheckout({
      collectedData: { duration: 240 },
      wantsKit: false,
      paymentStatus: 'APPROVED',
    }, TEST_PHONE)).toEqual({
      bookingContext: {
        ...emptyExpectedBookingContext(),
        collectedData: {
          ...emptyExpectedBookingContext().collectedData,
          duration: 240,
        },
        wantsKit: false,
        paymentStatus: 'APPROVED',
        calculatedPrice: 88_000,
      },
    });
  });
});
