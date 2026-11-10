import { parseCoexCustomerPhone } from './whatsappCoexWebhook.ts';
import { resolveInboundCustomer } from './whatsappInboundIdentity.ts';
import { COMMERCIAL_PHONE_NUMBER_ID, conversationStableKey } from './whatsappLines.ts';

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

export const REPLAYABLE_WEBHOOK_EVENT_TYPES = ['messages', 'smb_message_echoes'] as const;

export function isReplayableWebhookEvent(event: { event_type?: string | null }): boolean {
  const type = getString(event.event_type);
  return (REPLAYABLE_WEBHOOK_EVENT_TYPES as readonly string[]).includes(type);
}

/** Hilos cuyo preview hay que recomputar después de un replay, para que un
 * mensaje viejo no deje la lista en un texto anterior al último real. */
export function stableKeysTouchedByPayload(payload: unknown): string[] {
  const keys = new Set<string>();
  for (const entry of asArray(asRecord(payload).entry)) {
    for (const change of asArray(asRecord(entry).changes)) {
      const changeRecord = asRecord(change);
      const field = getString(changeRecord.field) || 'messages';
      const value = asRecord(changeRecord.value);
      const phoneNumberId = getString(asRecord(value.metadata).phone_number_id) || null;
      if (field === 'messages') {
        const contacts = asArray(value.contacts);
        for (const rawMessage of asArray(value.messages)) {
          const identity = resolveInboundCustomer(asRecord(rawMessage), contacts);
          if (!identity) continue;
          keys.add(conversationStableKey(identity.customerKey, phoneNumberId));
        }
      }
      if (field === 'smb_message_echoes') {
        for (const rawEcho of asArray(value.message_echoes)) {
          const parsed = parseCoexCustomerPhone(asRecord(rawEcho), phoneNumberId ?? '');
          if (!parsed) continue;
          keys.add(conversationStableKey(parsed.customerPhone, phoneNumberId));
        }
      }
    }
  }
  return [...keys];
}

export function filterCommercialWebhookEvents<T extends { payload: unknown }>(
  events: T[],
  phoneNumberId = COMMERCIAL_PHONE_NUMBER_ID,
): T[] {
  return events.filter((event) => payloadHasPhoneNumberId(event.payload, phoneNumberId));
}
