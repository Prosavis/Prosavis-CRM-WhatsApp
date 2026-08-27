import { COMMERCIAL_PHONE_NUMBER_ID } from './whatsappLines.ts';

type JsonRecord = Record<string, unknown>;

export const COMMERCIAL_REPLAY_DEFAULT_SINCE = '2026-08-27T00:00:00.000Z';

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isReplayUnprocessedRequest(payload: unknown): boolean {
  return asRecord(payload).replay_unprocessed === true;
}

export function isReplayAllLinesRequest(payload: unknown): boolean {
  return asRecord(payload).all_lines === true;
}

export function replaySinceFromPayload(payload: unknown): string {
  return getString(asRecord(payload).since) || COMMERCIAL_REPLAY_DEFAULT_SINCE;
}

export function payloadHasPhoneNumberId(
  payload: unknown,
  phoneNumberId: string,
): boolean {
  const wanted = phoneNumberId.trim();
  if (!wanted) return false;
  for (const entry of asArray(asRecord(payload).entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const metadata = asRecord(asRecord(change).value).metadata;
      if (getString(asRecord(metadata).phone_number_id) === wanted) return true;
    }
  }
  return false;
}

export function filterCommercialWebhookEvents<T extends { payload: unknown }>(
  events: T[],
  phoneNumberId = COMMERCIAL_PHONE_NUMBER_ID,
): T[] {
  return events.filter((event) => payloadHasPhoneNumberId(event.payload, phoneNumberId));
}
