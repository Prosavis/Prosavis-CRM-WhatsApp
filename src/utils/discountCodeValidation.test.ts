import { describe, expect, it } from 'vitest';
import {
  DISCOUNT_CODE_REGEX,
  isCreateDiscountFormValid,
  isValidDiscountCode,
  isValidFixedAmount,
  isValidPercent,
  isValidRedemptions,
  normalizeDiscountCode,
} from './discountCodeValidation';

describe('normalizeDiscountCode', () => {
  it('normaliza a mayúsculas y quita caracteres inválidos', () => {
    expect(normalizeDiscountCode('verano-25!')).toBe('VERANO25');
  });

  it('recorta a 10 caracteres', () => {
    expect(normalizeDiscountCode('ABCDEFGHIJKLMNOP')).toBe('ABCDEFGHIJ');
  });
});

describe('isValidDiscountCode / DISCOUNT_CODE_REGEX', () => {
  it('acepta códigos alfanuméricos 3–10', () => {
    expect(isValidDiscountCode('ABC')).toBe(true);
    expect(isValidDiscountCode('VERANO25')).toBe(true);
    expect(isValidDiscountCode('ABCDEFGHIJ')).toBe(true);
    expect(DISCOUNT_CODE_REGEX.test('PRO10')).toBe(true);
  });

  it('rechaza códigos cortos, largos o con símbolos', () => {
    expect(isValidDiscountCode('AB')).toBe(false);
    expect(isValidDiscountCode('ABCDEFGHIJK')).toBe(false);
    expect(isValidDiscountCode('VERANO-25')).toBe(false);
    expect(isValidDiscountCode('verano25')).toBe(false);
  });
});

describe('isValidFixedAmount / isValidPercent', () => {
  it('valida montos fijos > 0', () => {
    expect(isValidFixedAmount(5000)).toBe(true);
    expect(isValidFixedAmount(0)).toBe(false);
    expect(isValidFixedAmount(-1)).toBe(false);
    expect(isValidFixedAmount('')).toBe(false);
  });

  it('valida porcentaje 1–100', () => {
    expect(isValidPercent(1)).toBe(true);
    expect(isValidPercent(100)).toBe(true);
    expect(isValidPercent(0)).toBe(false);
    expect(isValidPercent(101)).toBe(false);
    expect(isValidPercent('')).toBe(false);
  });
});

describe('isValidRedemptions', () => {
  it('oncePerUser o único uso siempre válidos', () => {
    expect(isValidRedemptions(true, false, '')).toBe(true);
    expect(isValidRedemptions(false, true, '')).toBe(true);
  });

  it('multi-uso exige entero ≥ 2', () => {
    expect(isValidRedemptions(false, false, 2)).toBe(true);
    expect(isValidRedemptions(false, false, 5)).toBe(true);
    expect(isValidRedemptions(false, false, 1)).toBe(false);
    expect(isValidRedemptions(false, false, '')).toBe(false);
    expect(isValidRedemptions(false, false, 2.5)).toBe(false);
  });
});

describe('isCreateDiscountFormValid', () => {
  it('formulario monto fijo único uso', () => {
    expect(
      isCreateDiscountFormValid({
        code: 'PRO10',
        discountType: 'fixed_cop',
        amount: 10000,
        percent: '',
        oncePerUser: false,
        singleUse: true,
        maxRedemptions: '',
      }),
    ).toBe(true);
  });

  it('formulario oncePerUser sin máx canjes', () => {
    expect(
      isCreateDiscountFormValid({
        code: 'SALE15',
        discountType: 'percentage',
        amount: '',
        percent: 15,
        oncePerUser: true,
        singleUse: false,
        maxRedemptions: '',
      }),
    ).toBe(true);
  });

  it('formulario porcentaje multi-uso', () => {
    expect(
      isCreateDiscountFormValid({
        code: 'SALE15',
        discountType: 'percentage',
        amount: '',
        percent: 15,
        oncePerUser: false,
        singleUse: false,
        maxRedemptions: 5,
      }),
    ).toBe(true);
  });

  it('rechaza incompleto', () => {
    expect(
      isCreateDiscountFormValid({
        code: 'AB',
        discountType: 'fixed_cop',
        amount: 5000,
        percent: '',
        oncePerUser: false,
        singleUse: true,
        maxRedemptions: '',
      }),
    ).toBe(false);

    expect(
      isCreateDiscountFormValid({
        code: 'PRO10',
        discountType: 'percentage',
        amount: '',
        percent: '',
        oncePerUser: false,
        singleUse: true,
        maxRedemptions: '',
      }),
    ).toBe(false);
  });
});
