import type { Timestamp } from 'firebase-admin/firestore';

type FirestoreTimestampLike =
  | Timestamp
  | { _seconds: number; _nanoseconds?: number }
  | { seconds: number; nanoseconds?: number }
  | Date
  | string
  | number
  | null
  | undefined;

export function firestoreTimestampToIso(value: FirestoreTimestampLike | unknown): string | null {
  if (value == null) return null;

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }

  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate().toISOString();
  }

  const record = value as { _seconds?: number; seconds?: number; _nanoseconds?: number; nanoseconds?: number };
  const seconds = record._seconds ?? record.seconds;
  if (typeof seconds === 'number') {
    const nanos = record._nanoseconds ?? record.nanoseconds ?? 0;
    return new Date(seconds * 1000 + nanos / 1_000_000).toISOString();
  }

  return null;
}
