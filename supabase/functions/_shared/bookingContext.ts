export type BookingStage =
  | 'no_booking'
  | 'info_gathering'
  | 'availability'
  | 'summary_confirmation'
  | 'payment_pending'
  | 'payment_confirmed';

export type BookingPaymentStatus = 'APPROVED' | 'PENDING' | 'none';

export interface NormalizedBookingContext {
  stage: BookingStage;
  collectedData: {
    date: string | null;
    time: string | null;
    duration: number | null;
    address: string | null;
    addressSource: 'conversation' | 'lead' | null;
  };
  missingData: string[];
  availableSlots: string[];
  paymentStatus: BookingPaymentStatus;
  paymentAmount: number | null;
  wantsKit: boolean;
  calculatedPrice: number | null;
  clientInfo: {
    name: string | null;
    phone: string;
    email: string | null;
    address: string | null;
    city: string | null;
    isReturningClient: boolean;
    userId: string | null;
  };
}

const DEFAULT_MISSING_DATA = ['fecha', 'hora', 'duración', 'dirección'];
const BOOKING_STAGES = new Set<BookingStage>([
  'no_booking',
  'info_gathering',
  'availability',
  'summary_confirmation',
  'payment_pending',
  'payment_confirmed',
]);
const PAYMENT_STATUSES = new Set<BookingPaymentStatus>([
  'APPROVED',
  'PENDING',
  'none',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nullableFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringArray(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.filter((item): item is string => typeof item === 'string');
}

function bookingStage(value: unknown): BookingStage {
  return typeof value === 'string' && BOOKING_STAGES.has(value as BookingStage)
    ? value as BookingStage
    : 'no_booking';
}

function paymentStatus(value: unknown): BookingPaymentStatus {
  return typeof value === 'string' && PAYMENT_STATUSES.has(value as BookingPaymentStatus)
    ? value as BookingPaymentStatus
    : 'none';
}

function addressSource(value: unknown): 'conversation' | 'lead' | null {
  return value === 'conversation' || value === 'lead' ? value : null;
}

export function normalizeBookingContext(
  rawBookingContext: unknown,
  phone: string,
): NormalizedBookingContext {
  const source = isRecord(rawBookingContext) ? rawBookingContext : {};
  const collectedData = isRecord(source.collectedData) ? source.collectedData : {};
  const clientInfo = isRecord(source.clientInfo) ? source.clientInfo : {};

  return {
    stage: bookingStage(source.stage),
    collectedData: {
      date: nullableString(collectedData.date),
      time: nullableString(collectedData.time),
      duration: nullableFiniteNumber(collectedData.duration),
      address: nullableString(collectedData.address),
      addressSource: addressSource(collectedData.addressSource),
    },
    missingData: stringArray(source.missingData, DEFAULT_MISSING_DATA),
    availableSlots: stringArray(source.availableSlots, []),
    paymentStatus: paymentStatus(source.paymentStatus),
    paymentAmount: nullableFiniteNumber(source.paymentAmount),
    wantsKit: source.wantsKit === true,
    calculatedPrice: null,
    clientInfo: {
      name: nullableString(clientInfo.name),
      phone,
      email: nullableString(clientInfo.email),
      address: nullableString(clientInfo.address),
      city: nullableString(clientInfo.city),
      isReturningClient: clientInfo.isReturningClient === true,
      userId: nullableString(clientInfo.userId),
    },
  };
}
