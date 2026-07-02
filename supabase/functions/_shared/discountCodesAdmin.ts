import {
  createFirestoreDocument,
  deleteFirestoreDocument,
  getFirestoreDocument,
  patchFirestoreDocument,
  runFirestoreQuery,
} from './firebaseAdminRest.ts';

const COLLECTION = 'discount_codes';
const CODE_REGEX = /^[A-Z0-9]{3,10}$/;

type DiscountTypeInput = 'fixed_cop' | 'percentage';
type StatusInput = 'active' | 'redeemed' | 'deleted';

export class DiscountCodesError extends Error {
  constructor(
    public readonly code:
      | 'invalid-argument'
      | 'not-found'
      | 'already-exists'
      | 'failed-precondition'
      | 'internal',
    message: string,
  ) {
    super(message);
    this.name = 'DiscountCodesError';
  }
}

export function discountCodesErrorStatus(err: DiscountCodesError): number {
  switch (err.code) {
    case 'invalid-argument':
      return 400;
    case 'not-found':
      return 404;
    case 'already-exists':
      return 409;
    case 'failed-precondition':
      return 412;
    default:
      return 500;
  }
}

function nowTimestamp(): Date {
  return new Date();
}

function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export interface DiscountCodeResponse {
  id: string;
  code: string;
  discountType?: DiscountTypeInput;
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

function mapDocToResponse(id: string, data: Record<string, unknown>): DiscountCodeResponse {
  return {
    id,
    code: String(data.code ?? ''),
    discountType: (data.discountType as DiscountTypeInput) ?? 'fixed_cop',
    discountPercent:
      typeof data.discountPercent === 'number' ? data.discountPercent : undefined,
    discountAmountCOP: Number(data.discountAmountCOP ?? 0),
    maxRedemptions:
      typeof data.maxRedemptions === 'number' ? data.maxRedemptions : undefined,
    redemptionCount:
      typeof data.redemptionCount === 'number' ? data.redemptionCount : undefined,
    description: data.description != null ? String(data.description) : undefined,
    status: (data.status as DiscountCodeResponse['status']) ?? 'active',
    createdBy: String(data.createdBy ?? ''),
    createdAt: toIsoString(data.createdAt),
    redeemedBy: data.redeemedBy != null ? String(data.redeemedBy) : undefined,
    redeemedAt: toIsoString(data.redeemedAt),
    appointmentId: data.appointmentId != null ? String(data.appointmentId) : undefined,
    paymentId: data.paymentId != null ? String(data.paymentId) : undefined,
  };
}

async function findActiveOrRedeemedByCode(
  normalizedCode: string,
  excludeId?: string,
): Promise<boolean> {
  const docs = await runFirestoreQuery(COLLECTION, {
    where: {
      compositeFilter: {
        op: 'AND',
        filters: [
          {
            fieldFilter: {
              field: { fieldPath: 'code' },
              op: 'EQUAL',
              value: { stringValue: normalizedCode },
            },
          },
          {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'IN',
              value: {
                arrayValue: {
                  values: [{ stringValue: 'active' }, { stringValue: 'redeemed' }],
                },
              },
            },
          },
        ],
      },
    },
    limit: 2,
  });

  return docs.some((d) => d.id !== excludeId);
}

export async function listDiscountCodes(params: {
  status?: string;
  limit?: number;
}): Promise<{
  codes: DiscountCodeResponse[];
  hasMore: boolean;
  lastDocId: string | null;
}> {
  const pageSize = Math.min(params.limit ?? 50, 100);
  const structuredQuery: Record<string, unknown> = {
    orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
    limit: pageSize,
  };

  if (params.status && ['active', 'redeemed', 'deleted'].includes(params.status)) {
    structuredQuery.where = {
      fieldFilter: {
        field: { fieldPath: 'status' },
        op: 'EQUAL',
        value: { stringValue: params.status },
      },
    };
  }

  const docs = await runFirestoreQuery(COLLECTION, structuredQuery);
  const codes = docs.map((d) => mapDocToResponse(d.id, d.data));

  return {
    codes,
    hasMore: codes.length === pageSize,
    lastDocId: docs[docs.length - 1]?.id ?? null,
  };
}

export async function createDiscountCode(
  actorId: string,
  params: {
    code?: string;
    discountType?: DiscountTypeInput;
    discountAmountCOP?: number;
    discountPercent?: number;
    maxRedemptions?: number;
    singleUse?: boolean;
    description?: string;
  },
): Promise<DiscountCodeResponse> {
  const {
    code,
    discountType: rawDiscountType,
    discountAmountCOP,
    discountPercent,
    maxRedemptions: rawMaxRedemptions,
    singleUse,
    description,
  } = params;

  if (!code || typeof code !== 'string') {
    throw new DiscountCodesError('invalid-argument', 'El código es requerido');
  }

  const normalizedCode = code.trim().toUpperCase();

  if (!CODE_REGEX.test(normalizedCode)) {
    throw new DiscountCodesError(
      'invalid-argument',
      'El código debe tener entre 3 y 10 caracteres alfanuméricos [A-Z0-9]',
    );
  }

  const discountType: DiscountTypeInput =
    rawDiscountType === 'percentage' ? 'percentage' : 'fixed_cop';

  let maxRedemptions = 1;
  if (typeof rawMaxRedemptions === 'number' && Number.isFinite(rawMaxRedemptions)) {
    maxRedemptions = Math.floor(rawMaxRedemptions);
  }
  if (singleUse === true) {
    maxRedemptions = 1;
  } else if (singleUse === false) {
    if (
      typeof rawMaxRedemptions !== 'number' ||
      !Number.isFinite(rawMaxRedemptions) ||
      Math.floor(rawMaxRedemptions) < 2
    ) {
      throw new DiscountCodesError(
        'invalid-argument',
        'Si no es único uso, indica un máximo de canjes de al menos 2',
      );
    }
    maxRedemptions = Math.floor(rawMaxRedemptions);
  }
  if (maxRedemptions < 1) {
    throw new DiscountCodesError(
      'invalid-argument',
      'El número máximo de canjes debe ser al menos 1',
    );
  }

  const payload: Record<string, unknown> = {
    code: normalizedCode,
    discountType,
    description: description?.trim() || null,
    status: 'active',
    createdBy: actorId,
    createdAt: nowTimestamp(),
    redemptionCount: 0,
    maxRedemptions,
  };

  if (discountType === 'percentage') {
    const p = typeof discountPercent === 'number' ? discountPercent : NaN;
    if (!Number.isFinite(p) || p < 1 || p > 100) {
      throw new DiscountCodesError(
        'invalid-argument',
        'El porcentaje debe ser un entero entre 1 y 100',
      );
    }
    payload.discountPercent = Math.floor(p);
    payload.discountAmountCOP = 0;
  } else {
    if (
      !discountAmountCOP ||
      typeof discountAmountCOP !== 'number' ||
      discountAmountCOP <= 0
    ) {
      throw new DiscountCodesError(
        'invalid-argument',
        'El monto del descuento debe ser mayor a 0',
      );
    }
    payload.discountAmountCOP = Math.floor(discountAmountCOP);
  }

  if (await findActiveOrRedeemedByCode(normalizedCode)) {
    throw new DiscountCodesError(
      'already-exists',
      `El código "${normalizedCode}" ya existe`,
    );
  }

  const created = await createFirestoreDocument(COLLECTION, payload);
  return mapDocToResponse(created.id, { ...payload, ...created.data });
}

export async function updateDiscountCode(
  actorId: string,
  params: {
    id?: string;
    code?: string;
    discountType?: DiscountTypeInput;
    discountAmountCOP?: number;
    discountPercent?: number;
    maxRedemptions?: number;
    description?: string;
    status?: StatusInput;
  },
): Promise<DiscountCodeResponse> {
  const {
    id,
    code,
    discountType: rawDiscountType,
    discountAmountCOP,
    discountPercent,
    maxRedemptions: rawMaxRedemptions,
    description,
    status: rawStatus,
  } = params;

  if (!id || typeof id !== 'string') {
    throw new DiscountCodesError('invalid-argument', 'El ID del código es requerido');
  }

  const currentData = await getFirestoreDocument(COLLECTION, id);
  if (!currentData) {
    throw new DiscountCodesError('not-found', 'Código de descuento no encontrado');
  }

  const updates: Record<string, unknown> = {};
  let hasChanges = false;

  if (code !== undefined) {
    if (typeof code !== 'string') {
      throw new DiscountCodesError('invalid-argument', 'El código debe ser un texto');
    }
    const normalizedCode = code.trim().toUpperCase();
    if (!CODE_REGEX.test(normalizedCode)) {
      throw new DiscountCodesError(
        'invalid-argument',
        'El código debe tener entre 3 y 10 caracteres alfanuméricos [A-Z0-9]',
      );
    }
    if (await findActiveOrRedeemedByCode(normalizedCode, id)) {
      throw new DiscountCodesError(
        'already-exists',
        `El código "${normalizedCode}" ya está en uso`,
      );
    }
    updates.code = normalizedCode;
    hasChanges = true;
  }

  if (rawDiscountType !== undefined) {
    if (rawDiscountType !== 'fixed_cop' && rawDiscountType !== 'percentage') {
      throw new DiscountCodesError(
        'invalid-argument',
        'El tipo de descuento debe ser "fixed_cop" o "percentage"',
      );
    }
    if (rawDiscountType === 'percentage') {
      const p = typeof discountPercent === 'number' ? discountPercent : NaN;
      if (!Number.isFinite(p) || p < 1 || p > 100) {
        throw new DiscountCodesError(
          'invalid-argument',
          'Si el tipo es porcentaje, el porcentaje debe ser un entero entre 1 y 100',
        );
      }
      updates.discountPercent = Math.floor(p);
      updates.discountAmountCOP = 0;
    } else {
      if (
        typeof discountAmountCOP !== 'number' ||
        !Number.isFinite(discountAmountCOP) ||
        discountAmountCOP <= 0
      ) {
        throw new DiscountCodesError(
          'invalid-argument',
          'Si el tipo es monto fijo, el monto debe ser mayor a 0',
        );
      }
      updates.discountAmountCOP = Math.floor(discountAmountCOP);
      updates.discountPercent = null;
    }
    updates.discountType = rawDiscountType;
    hasChanges = true;
  }

  if (rawDiscountType === undefined && discountPercent !== undefined) {
    const currentType = String(currentData.discountType ?? '');
    if (currentType !== 'percentage') {
      throw new DiscountCodesError(
        'failed-precondition',
        "No se puede establecer un porcentaje si el tipo de descuento no es 'percentage'",
      );
    }
    if (
      typeof discountPercent !== 'number' ||
      !Number.isFinite(discountPercent) ||
      discountPercent < 1 ||
      discountPercent > 100
    ) {
      throw new DiscountCodesError(
        'invalid-argument',
        'El porcentaje debe ser un entero entre 1 y 100',
      );
    }
    updates.discountPercent = Math.floor(discountPercent);
    hasChanges = true;
  }

  if (rawDiscountType === undefined && discountAmountCOP !== undefined) {
    const currentType = String(currentData.discountType ?? '');
    if (currentType !== 'fixed_cop') {
      throw new DiscountCodesError(
        'failed-precondition',
        "No se puede establecer un monto fijo si el tipo de descuento no es 'fixed_cop'",
      );
    }
    if (
      typeof discountAmountCOP !== 'number' ||
      !Number.isFinite(discountAmountCOP) ||
      discountAmountCOP <= 0
    ) {
      throw new DiscountCodesError(
        'invalid-argument',
        'El monto del descuento debe ser mayor a 0',
      );
    }
    updates.discountAmountCOP = Math.floor(discountAmountCOP);
    hasChanges = true;
  }

  if (rawMaxRedemptions !== undefined) {
    if (typeof rawMaxRedemptions !== 'number' || !Number.isFinite(rawMaxRedemptions)) {
      throw new DiscountCodesError(
        'invalid-argument',
        'El número máximo de canjes debe ser un número válido',
      );
    }
    const parsed = Math.floor(rawMaxRedemptions);
    if (parsed < 1) {
      throw new DiscountCodesError(
        'invalid-argument',
        'El número máximo de canjes debe ser al menos 1',
      );
    }
    const currentRedemptionCount = Number(currentData.redemptionCount ?? 0);
    if (parsed < currentRedemptionCount) {
      throw new DiscountCodesError(
        'failed-precondition',
        `No se puede reducir maxRedemptions a ${parsed} porque ya se han realizado ${currentRedemptionCount} canjes`,
      );
    }
    updates.maxRedemptions = parsed;
    hasChanges = true;
  }

  if (description !== undefined) {
    if (typeof description !== 'string') {
      throw new DiscountCodesError('invalid-argument', 'La descripción debe ser un texto');
    }
    updates.description = description.trim() || null;
    hasChanges = true;
  }

  if (rawStatus !== undefined) {
    const validStatuses: StatusInput[] = ['active', 'redeemed', 'deleted'];
    if (!validStatuses.includes(rawStatus)) {
      throw new DiscountCodesError(
        'invalid-argument',
        'El estado debe ser "active", "redeemed" o "deleted"',
      );
    }
    const currentStatus = String(currentData.status ?? '');
    if (currentStatus === 'deleted' && rawStatus !== 'deleted') {
      throw new DiscountCodesError(
        'failed-precondition',
        'No se puede reactivar un código eliminado',
      );
    }
    if (
      currentStatus === 'redeemed' &&
      rawStatus !== 'deleted' &&
      rawStatus !== 'redeemed'
    ) {
      throw new DiscountCodesError(
        'failed-precondition',
        "No se puede cambiar el estado de un código canjeado (solo a 'deleted')",
      );
    }
    updates.status = rawStatus;
    if (rawStatus === 'deleted') {
      updates.deletedBy = actorId;
      updates.deletedAt = nowTimestamp();
    }
    hasChanges = true;
  }

  if (!hasChanges) {
    return mapDocToResponse(id, currentData);
  }

  updates.updatedAt = nowTimestamp();
  updates.updatedBy = actorId;

  await patchFirestoreDocument(COLLECTION, id, updates);
  const updatedData = await getFirestoreDocument(COLLECTION, id);
  if (!updatedData) {
    throw new DiscountCodesError('internal', 'No se pudo leer el código actualizado');
  }
  return mapDocToResponse(id, updatedData);
}

export async function deleteDiscountCode(
  actorId: string,
  id: string,
): Promise<{ success: boolean; id: string }> {
  if (!id || typeof id !== 'string') {
    throw new DiscountCodesError('invalid-argument', 'El ID del código es requerido');
  }

  const data = await getFirestoreDocument(COLLECTION, id);
  if (!data) {
    throw new DiscountCodesError('not-found', 'Código de descuento no encontrado');
  }

  if (data.status !== 'active') {
    throw new DiscountCodesError(
      'failed-precondition',
      `Solo se pueden eliminar códigos activos. Estado actual: ${data.status}`,
    );
  }

  await patchFirestoreDocument(COLLECTION, id, {
    status: 'deleted',
    deletedBy: actorId,
    deletedAt: nowTimestamp(),
  });

  return { success: true, id };
}

export async function permanentDeleteDiscountCode(
  actorId: string,
  id: string,
): Promise<{ success: boolean; id: string }> {
  if (!id || typeof id !== 'string') {
    throw new DiscountCodesError('invalid-argument', 'El ID del código es requerido');
  }

  const data = await getFirestoreDocument(COLLECTION, id);
  if (!data) {
    throw new DiscountCodesError('not-found', 'Código de descuento no encontrado');
  }

  if (data.status !== 'deleted') {
    throw new DiscountCodesError(
      'failed-precondition',
      "Solo se pueden eliminar definitivamente códigos con estado 'eliminado'",
    );
  }

  await deleteFirestoreDocument(COLLECTION, id);
  console.info('Código de descuento eliminado permanentemente', {
    id,
    code: data.code,
    deletedPermanentlyBy: actorId,
  });

  return { success: true, id };
}
