import type {
  WhatsAppAdminPresence,
  WhatsAppAdminPresenceActivity,
} from '@/services/whatsappService';

/** Payload published via Supabase Realtime Presence `track()`. */
export interface WhatsAppPresenceTrackPayload {
  uid: string;
  displayName: string;
  conversationId: string;
  activity: 'viewing' | 'typing';
  phoneNumberId: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePresenceMeta(raw: unknown): WhatsAppAdminPresence | null {
  if (!isRecord(raw)) return null;
  const uid = typeof raw.uid === 'string' ? raw.uid.trim() : '';
  if (!uid) return null;

  const conversationId =
    typeof raw.conversationId === 'string' ? raw.conversationId.trim() : '';
  const activityRaw = typeof raw.activity === 'string' ? raw.activity : 'none';
  const activity: WhatsAppAdminPresenceActivity =
    activityRaw === 'typing' || activityRaw === 'viewing' || activityRaw === 'none'
      ? activityRaw
      : 'none';

  const updatedAt =
    typeof raw.updatedAt === 'string' && raw.updatedAt
      ? new Date(raw.updatedAt)
      : undefined;

  return {
    uid,
    phoneNumberId: typeof raw.phoneNumberId === 'string' ? raw.phoneNumberId : null,
    conversationId: conversationId || null,
    displayName: typeof raw.displayName === 'string' ? raw.displayName : null,
    activity,
    updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : undefined,
  };
}

/**
 * Maps `channel.presenceState()` into the UI presence contract.
 * Keeps the freshest meta per admin uid.
 */
export function presenceStateToEntries(
  state: Record<string, unknown[] | undefined>,
): WhatsAppAdminPresence[] {
  const byUid = new Map<string, WhatsAppAdminPresence>();
  for (const metas of Object.values(state)) {
    if (!Array.isArray(metas)) continue;
    for (const raw of metas) {
      const entry = parsePresenceMeta(raw);
      if (!entry) continue;
      if (entry.activity === 'none' || !entry.conversationId) continue;
      const prev = byUid.get(entry.uid);
      if (!prev || (entry.updatedAt?.getTime() ?? 0) >= (prev.updatedAt?.getTime() ?? 0)) {
        byUid.set(entry.uid, entry);
      }
    }
  }
  return Array.from(byUid.values());
}

/** Keep the freshest row per admin uid (defensive against legacy duplicates). */
export function dedupePresencesByUid(entries: WhatsAppAdminPresence[]): WhatsAppAdminPresence[] {
  const byUid = new Map<string, WhatsAppAdminPresence>();
  for (const entry of entries) {
    if (!entry.uid) continue;
    const prev = byUid.get(entry.uid);
    if (!prev) {
      byUid.set(entry.uid, entry);
      continue;
    }
    const prevAt = prev.updatedAt?.getTime() ?? 0;
    const nextAt = entry.updatedAt?.getTime() ?? 0;
    if (nextAt >= prevAt) byUid.set(entry.uid, entry);
  }
  return Array.from(byUid.values());
}

function formatPresenceNames(list: WhatsAppAdminPresence[]): string {
  const names = Array.from(
    new Set(
      list
        .map((p) => (p.displayName || 'Administrador').trim())
        .filter(Boolean),
    ),
  );
  if (names.length === 0) return 'Administrador';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** Human summary for inbox list + chat banner. Typing wins over viewing. */
export function summarizePeerPresences(peers: WhatsAppAdminPresence[]): {
  text: string;
  typing: boolean;
} | null {
  const unique = dedupePresencesByUid(peers);
  if (!unique.length) return null;

  const typing = unique.filter((p) => p.activity === 'typing');
  const viewing = unique.filter((p) => p.activity !== 'typing');

  if (typing.length > 0) {
    const verb = typing.length === 1 ? 'está escribiendo…' : 'están escribiendo…';
    return { text: `${formatPresenceNames(typing)} ${verb}`, typing: true };
  }

  const verb = viewing.length === 1 ? 'está viendo este chat' : 'están viendo este chat';
  return { text: `${formatPresenceNames(viewing)} ${verb}`, typing: false };
}
