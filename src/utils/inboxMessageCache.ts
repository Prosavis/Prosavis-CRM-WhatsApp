import type { WhatsAppMessage } from '@/services/whatsappService';

export const INBOX_MESSAGE_PAGE_SIZE = 200;

export function mergeInboxMessages(
  current: WhatsAppMessage[],
  incoming: WhatsAppMessage[],
): WhatsAppMessage[] {
  const byId = new Map<string, WhatsAppMessage>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) {
    const existing = byId.get(message.id);
    byId.set(message.id, existing ? { ...existing, ...message } : message);
  }

  const byRequest = new Map<string, string>();
  for (const message of byId.values()) {
    const requestId = message.clientRequestId?.trim();
    if (requestId && !message.id.startsWith('opt_')) {
      byRequest.set(requestId, message.id);
    }
  }

  for (const message of [...byId.values()]) {
    const requestId = message.clientRequestId?.trim();
    if (message.id.startsWith('opt_') && requestId && byRequest.has(requestId)) {
      byId.delete(message.id);
    }
  }

  return [...byId.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export function applyInboxMessageEvent(
  current: WhatsAppMessage[],
  event: {
    eventType: 'INSERT' | 'UPDATE' | 'DELETE';
    new?: WhatsAppMessage | null;
    oldId?: string | null;
  },
): WhatsAppMessage[] {
  switch (event.eventType) {
    case 'INSERT':
    case 'UPDATE':
      return event.new ? mergeInboxMessages(current, [event.new]) : current;
    case 'DELETE':
      if (!event.oldId) return current;
      return current.filter((message) => message.id !== event.oldId);
    default: {
      const exhaustive: never = event.eventType;
      return exhaustive;
    }
  }
}

export function reconcileOptimisticMessage(
  current: WhatsAppMessage[],
  optimisticId: string,
  confirmed: Partial<WhatsAppMessage> & Pick<WhatsAppMessage, 'id'>,
): WhatsAppMessage[] {
  const withoutOptimistic = current.filter((message) => message.id !== optimisticId);
  const existingIdx = withoutOptimistic.findIndex((message) => message.id === confirmed.id);
  if (existingIdx === -1) {
    const optimistic = current.find((message) => message.id === optimisticId);
    return mergeInboxMessages(withoutOptimistic, [
      {
        ...(optimistic ?? {
          direction: 'outbound',
          senderType: 'agent',
          status: 'sent',
          createdAt: new Date(),
        }),
        ...confirmed,
      } as WhatsAppMessage,
    ]);
  }
  const next = [...withoutOptimistic];
  next[existingIdx] = { ...next[existingIdx], ...confirmed };
  return next;
}

export function markOptimisticFailed(
  current: WhatsAppMessage[],
  optimisticId: string,
  errorMessage: string,
): WhatsAppMessage[] {
  return current.map((message) =>
    message.id === optimisticId
      ? { ...message, status: 'failed', errorMessage }
      : message,
  );
}

export function prependOlderMessages(
  current: WhatsAppMessage[],
  older: WhatsAppMessage[],
): WhatsAppMessage[] {
  return mergeInboxMessages(older, current);
}

export function hasMoreMessages(fetchedCount: number, pageSize: number = INBOX_MESSAGE_PAGE_SIZE): boolean {
  return fetchedCount >= pageSize;
}
