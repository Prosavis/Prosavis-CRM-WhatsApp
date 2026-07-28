/** Validación de códigos de descuento (UI CRM + contratos admin). */

export type DiscountCodeType = 'fixed_cop' | 'percentage';

export const DISCOUNT_CODE_REGEX = /^[A-Z0-9]{3,10}$/;

export function normalizeDiscountCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

export function isValidDiscountCode(code: string): boolean {
  return DISCOUNT_CODE_REGEX.test(code);
}

export function isValidFixedAmount(amount: number | ''): amount is number {
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
}

export function isValidPercent(percent: number | ''): percent is number {
  return (
    typeof percent === 'number' &&
    Number.isFinite(percent) &&
    percent >= 1 &&
    percent <= 100
  );
}

export function isValidRedemptions(
  oncePerUser: boolean,
  singleUse: boolean,
  maxRedemptions: number | '',
): boolean {
  if (oncePerUser) return true;
  if (singleUse) return true;
  return (
    typeof maxRedemptions === 'number' &&
    Number.isInteger(maxRedemptions) &&
    maxRedemptions >= 2
  );
}

export function isCreateDiscountFormValid(params: {
  code: string;
  discountType: DiscountCodeType;
  amount: number | '';
  percent: number | '';
  oncePerUser: boolean;
  singleUse: boolean;
  maxRedemptions: number | '';
}): boolean {
  const codeOk = isValidDiscountCode(params.code);
  const valueOk =
    params.discountType === 'fixed_cop'
      ? isValidFixedAmount(params.amount)
      : isValidPercent(params.percent);
  const redemptionsOk = isValidRedemptions(
    params.oncePerUser,
    params.singleUse,
    params.maxRedemptions,
  );
  return codeOk && valueOk && redemptionsOk;
}
