type JsonRecord = Record<string, unknown>;

export const LID_CUSTOMER_PREFIX = 'lid:';

export type InboundCustomerKind = 'phone' | 'lid';

export interface InboundCustomer {
  kind: InboundCustomerKind;
  customerKey: string;
  userId: string | null;
  profileName: string | null;
  username: string | null;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isLidCustomerKey(customerKey: string | null | undefined): boolean {
  return (customerKey ?? '').trim().startsWith(LID_CUSTOMER_PREFIX);
}

export function lidCustomerKey(userId: string): string {
  return `${LID_CUSTOMER_PREFIX}${userId.trim()}`;
}

export function formatWebhookError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message && message !== '[object Object]') return message;
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const code = getString(record.code);
    const message = getString(record.message);
    const details = getString(record.details);
    const hint = getString(record.hint);
    const parts = [code, message, details, hint].filter(Boolean);
    if (parts.length > 0) return parts.join(' — ');
    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}' && json !== 'null') return json;
    } catch {
      // ignore
    }
  }
  const fallback = String(error);
  return fallback === '[object Object]' ? 'Error desconocido' : fallback;
}

export function resolveInboundCustomer(
  message: JsonRecord,
  contacts: unknown[],
): InboundCustomer | null {
  const from = getString(message.from);
  const fromUserId = getString(message.from_user_id);
  let waId = '';
  let userId = fromUserId;
  let profileName = '';
  let username = '';

  for (const contact of contacts) {
    const record = asRecord(contact);
    const profile = asRecord(record.profile);
    const contactWaId = getString(record.wa_id);
    const contactUserId = getString(record.user_id);
    if (!userId && contactUserId) userId = contactUserId;

    const matchesFrom = Boolean(from) && contactWaId === from;
    const matchesUser = Boolean(fromUserId) && contactUserId === fromUserId;
    const onlyContact = !from && !fromUserId;
    if (!matchesFrom && !matchesUser && !onlyContact) continue;

    if (contactWaId) waId = contactWaId;
    if (getString(profile.name)) profileName = getString(profile.name);
    if (getString(profile.username)) username = getString(profile.username);
    if (contactUserId) userId = contactUserId;
  }

  const phone = from || waId;
  if (phone) {
    return {
      kind: 'phone',
      customerKey: phone,
      userId: userId || null,
      profileName: profileName || null,
      username: username || null,
    };
  }
  if (userId) {
    return {
      kind: 'lid',
      customerKey: lidCustomerKey(userId),
      userId,
      profileName: profileName || username || null,
      username: username || null,
    };
  }
  return null;
}
