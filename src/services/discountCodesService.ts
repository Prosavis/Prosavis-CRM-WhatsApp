import { supabase } from '../config/supabase';

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

async function parseInvokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx) {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body.error) return body.error;
    } catch {
      /* ignore */
    }
  }
  return error instanceof Error ? error.message : 'Error en códigos de descuento';
}

async function invokeDiscountCodes<T>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('discount-codes-admin', {
    body,
  });

  if (error) {
    throw new Error(await parseInvokeError(error));
  }
  if (data === null || data === undefined) {
    throw new Error('Respuesta vacía de discount-codes-admin');
  }
  if (typeof data === 'object' && data !== null && 'error' in data) {
    const err = (data as { error?: string }).error;
    if (typeof err === 'string' && err.length > 0) {
      throw new Error(err);
    }
  }
  return data;
}

export const createDiscountCodeFn = async (
  params: CreateDiscountCodeParams,
): Promise<DiscountCodeData> => {
  return invokeDiscountCodes<DiscountCodeData>({ action: 'create', ...params });
};

export const listDiscountCodesFn = async (
  params?: ListDiscountCodesParams,
): Promise<ListDiscountCodesResponse> => {
  return invokeDiscountCodes<ListDiscountCodesResponse>({
    action: 'list',
    ...(params ?? {}),
  });
};

export const updateDiscountCodeFn = async (
  params: UpdateDiscountCodeParams,
): Promise<DiscountCodeData> => {
  return invokeDiscountCodes<DiscountCodeData>({ action: 'update', ...params });
};

export const deleteDiscountCodeFn = async (id: string): Promise<void> => {
  await invokeDiscountCodes<{ success: boolean }>({ action: 'delete', id });
};

export const permanentDeleteDiscountCodeFn = async (id: string): Promise<void> => {
  await invokeDiscountCodes<{ success: boolean }>({ action: 'permanentDelete', id });
};
