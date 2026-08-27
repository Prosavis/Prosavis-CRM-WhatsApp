export interface InboundAlertConversation {
  id: string;
  lastMessageDirection?: string | null;
  lastMessageAt?: Date | null;
}

export function detectNewInboundConversations<T extends InboundAlertConversation>(
  conversations: T[],
  prevSnapshot: Map<string, number>,
  now = Date.now(),
  newConvMaxAgeMs = 120_000,
): { nextSnapshot: Map<string, number>; candidates: T[] } {
  const nextSnapshot = new Map<string, number>();
  for (const conversation of conversations) {
    nextSnapshot.set(conversation.id, conversation.lastMessageAt?.getTime() ?? 0);
  }

  const candidates: T[] = [];
  for (const conversation of conversations) {
    if (conversation.lastMessageDirection !== 'inbound') continue;
    const at = conversation.lastMessageAt?.getTime() ?? 0;
    if (at === 0) continue;
    const prev = prevSnapshot.get(conversation.id);
    if (prev === undefined) {
      const age = now - at;
      if (age >= 0 && age < newConvMaxAgeMs) candidates.push(conversation);
    } else if (at > prev) {
      candidates.push(conversation);
    }
  }

  return { nextSnapshot, candidates };
}

export function pickLatestInbound<T extends InboundAlertConversation>(
  candidates: T[],
): T | undefined {
  if (candidates.length === 0) return undefined;
  return candidates.reduce((latest, current) => {
    const latestAt = latest.lastMessageAt?.getTime() ?? 0;
    const currentAt = current.lastMessageAt?.getTime() ?? 0;
    return currentAt >= latestAt ? current : latest;
  });
}
