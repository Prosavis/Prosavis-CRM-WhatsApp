import { describe, expect, it } from 'vitest';
import {
  extractStatusPricing,
  isFreeEntryPointType,
  pricingPatchForStatus,
} from '../../supabase/functions/_shared/whatsappStatusPricing';

describe('whatsappStatusPricing', () => {
  it('copia category, type y billable cuando el status es delivered', () => {
    const patch = pricingPatchForStatus({
      id: 'wamid.1',
      status: 'delivered',
      pricing: {
        billable: true,
        category: 'service',
        type: 'regular',
      },
    });
    expect(patch).toEqual({
      pricing_category: 'service',
      pricing_type: 'regular',
      pricing_billable: true,
    });
  });

  it('no llena columnas en sent ni en failed', () => {
    const pricing = { billable: true, category: 'utility', type: 'regular' };
    expect(pricingPatchForStatus({ status: 'sent', pricing })).toBeNull();
    expect(pricingPatchForStatus({ status: 'failed', pricing })).toBeNull();
  });

  it('persiste pricing en read porque ya se entregó', () => {
    expect(pricingPatchForStatus({
      status: 'read',
      pricing: { billable: false, category: 'Marketing', type: 'free_entry_point' },
    })).toEqual({
      pricing_category: 'marketing',
      pricing_type: 'free_entry_point',
      pricing_billable: false,
    });
  });

  it('reconoce free entry point y deja billable en null si Meta no lo manda', () => {
    expect(isFreeEntryPointType('free_entry_point')).toBe(true);
    expect(isFreeEntryPointType('regular')).toBe(false);
    expect(extractStatusPricing({
      pricing: { category: 'service', type: 'free_customer_service' },
    })).toEqual({
      category: 'service',
      type: 'free_customer_service',
      billable: null,
    });
  });
});
