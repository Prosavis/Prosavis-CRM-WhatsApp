import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export type DiscountCodeType = 'fixed_cop' | 'percentage';

export interface DiscountCodeData {
  id: string;
  code: string;
  discountType?: DiscountCodeType;
  discountPercent?: number;
  discountAmountCOP: number;
  maxRedemptions?: number;
  redemptionCount?: number;
  description?: string;
  status: 'active' | 'redeemed' | 'deleted';
  createdBy: string;
  createdAt: string | null;
  redeemedBy?: string;
  redeemedAt?: string | null;
  appointmentId?: string;
  paymentId?: string;
}

interface CreateDiscountCodeParams {
  code: string;
  discountType?: DiscountCodeType;
  discountAmountCOP?: number;
  discountPercent?: number;
  maxRedemptions?: number;
  singleUse?: boolean;
  description?: string;
}

interface UpdateDiscountCodeParams {
  id: string;
  code?: string;
  discountType?: DiscountCodeType;
  discountAmountCOP?: number;
  discountPercent?: number;
  maxRedemptions?: number;
  description?: string;
  status?: 'active' | 'redeemed' | 'deleted';
}

interface ListDiscountCodesParams {
  status?: string;
  limit?: number;
}

interface ListDiscountCodesResponse {
  codes: DiscountCodeData[];
  hasMore: boolean;
  lastDocId: string | null;
}

export const createDiscountCodeFn = async (
  params: CreateDiscountCodeParams
): Promise<DiscountCodeData> => {
  const callable = httpsCallable<CreateDiscountCodeParams, DiscountCodeData>(
    functions,
    'createDiscountCode'
  );
  const result = await callable(params);
  return result.data;
};

export const listDiscountCodesFn = async (
  params?: ListDiscountCodesParams
): Promise<ListDiscountCodesResponse> => {
  const callable = httpsCallable<
    ListDiscountCodesParams | Record<string, never>,
    ListDiscountCodesResponse
  >(functions, 'listDiscountCodes');
  const result = await callable(params ?? {});
  return result.data;
};

export const updateDiscountCodeFn = async (
  params: UpdateDiscountCodeParams
): Promise<DiscountCodeData> => {
  const callable = httpsCallable<UpdateDiscountCodeParams, DiscountCodeData>(
    functions,
    'updateDiscountCode'
  );
  const result = await callable(params);
  return result.data;
};

export const deleteDiscountCodeFn = async (id: string): Promise<void> => {
  const callable = httpsCallable<{ id: string }, { success: boolean }>(
    functions,
    'deleteDiscountCode'
  );
  await callable({ id });
};

export const permanentDeleteDiscountCodeFn = async (id: string): Promise<void> => {
  const callable = httpsCallable<{ id: string }, { success: boolean }>(
    functions,
    'permanentDeleteDiscountCode'
  );
  await callable({ id });
};
