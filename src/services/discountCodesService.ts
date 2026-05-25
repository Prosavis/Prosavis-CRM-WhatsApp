import { supabase } from '@/config/supabase';

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

function mapRow(row: Record<string, unknown>): DiscountCodeData {
  return {
    id: String(row.id),
    code: String(row.code),
    discountType: (row.discount_type as DiscountCodeType) ?? 'fixed_cop',
    discountPercent: row.discount_percent != null ? Number(row.discount_percent) : undefined,
    discountAmountCOP: Number(row.discount_amount_cop ?? 0),
    maxRedemptions: row.max_redemptions != null ? Number(row.max_redemptions) : undefined,
    redemptionCount: Number(row.redemption_count ?? 0),
    description: row.description != null ? String(row.description) : undefined,
    status: row.status as DiscountCodeData['status'],
    createdBy: String(row.created_by ?? ''),
    createdAt: row.created_at != null ? String(row.created_at) : null,
    redeemedBy: row.redeemed_by != null ? String(row.redeemed_by) : undefined,
    redeemedAt: row.redeemed_at != null ? String(row.redeemed_at) : null,
    appointmentId: row.appointment_id != null ? String(row.appointment_id) : undefined,
    paymentId: row.payment_id != null ? String(row.payment_id) : undefined,
  };
}

export const createDiscountCodeFn = async (params: {
  code: string;
  discountType?: DiscountCodeType;
  discountAmountCOP?: number;
  discountPercent?: number;
  maxRedemptions?: number;
  singleUse?: boolean;
  description?: string;
}): Promise<DiscountCodeData> => {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('crm_discount_codes')
    .insert({
      code: params.code.trim().toUpperCase(),
      discount_type: params.discountType ?? 'fixed_cop',
      discount_amount_cop: params.discountAmountCOP ?? 0,
      discount_percent: params.discountPercent ?? null,
      max_redemptions: params.singleUse ? 1 : params.maxRedemptions ?? null,
      description: params.description ?? null,
      created_by: userData.user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapRow(data);
};

export const listDiscountCodesFn = async (params?: {
  status?: string;
  limit?: number;
}): Promise<{
  codes: DiscountCodeData[];
  hasMore: boolean;
  lastDocId: string | null;
}> => {
  const limit = params?.limit ?? 50;
  let query = supabase
    .from('crm_discount_codes')
    .select('*')
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (params?.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }
  const { data, error } = await query;
  if (error) throw error;
  const codes = (data ?? []).map((row) => mapRow(row));
  return { codes, hasMore: codes.length >= limit, lastDocId: codes.at(-1)?.id ?? null };
};

export const deleteDiscountCodeFn = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('crm_discount_codes')
    .update({ status: 'deleted' })
    .eq('id', id);
  if (error) throw error;
};

export const permanentDeleteDiscountCodeFn = async (id: string): Promise<void> => {
  const { error } = await supabase.from('crm_discount_codes').delete().eq('id', id);
  if (error) throw error;
};
