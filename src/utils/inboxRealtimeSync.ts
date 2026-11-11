import type { SupabaseClient } from '@supabase/supabase-js';
import type { WhatsAppConversation, WhatsAppMessage } from '@/services/whatsappService';
import {
  applyInboxRealtimeEvent,
  createInboxRealtimeCoalescer,
  previewFromMessageInsert,
  type ConversationPreviewMessage,
  type InboxConversationRowLike,
  type InboxListFilter,
  type InboxRealtimeEvent,
} from '@/utils/inboxConversationCache';
import { applyInboxMessageEvent } from '@/utils/inboxMessageCache';

type Unsubscribe = () => void;

export const INBOX_CHANNEL_RETRY_MIN_MS = 2_000;
export const INBOX_CHANNEL_RETRY_MAX_MS = 30_000;

export interface PostgresChangeBinding {
  filter: {
    event: string;
    schema: string;
    table: string;
    filter?: string;
  };
  callback: (payload: {
    eventType: string;
    new: Record<string, unknown> | null;
    old: Record<string, unknown> | null;
  }) => void;
}

interface PostgresChannelLike {
  on: (
    event: 'postgres_changes',
    filter: PostgresChangeBinding['filter'],
    callback: (payload: unknown) => void,
  ) => PostgresChannelLike;
  subscribe: (callback?: (status: string) => void) => unknown;
}

export interface PostgresChannelClient<TChannel> {
  channel: (name: string) => TChannel;
  removeChannel: (channel: TChannel) => unknown;
}

function asPostgresChannel(channel: unknown): PostgresChannelLike {
  return channel as PostgresChannelLike;
}

export function inboxChannelRetryDelay(attempt: number): number {
  return Math.min(INBOX_CHANNEL_RETRY_MAX_MS, INBOX_CHANNEL_RETRY_MIN_MS * 2 ** attempt);
}

/**
 * Suscripción a postgres_changes con topic único.
 * supabase-js devuelve el canal existente si el topic coincide, aunque esté
 * cerrándose, y subscribe() no se une si el canal no está closed.
 */
export function openPostgresChannel<TChannel>(options: {
  client: PostgresChannelClient<TChannel>;
  baseName: string;
  bindings: PostgresChangeBinding[];
  onResubscribed?: () => void;
  schedule?: (fn: () => void, ms: number) => { cancel: () => void };
  createTopic?: (baseName: string) => string;
}): Unsubscribe {
  const schedule =
    options.schedule ??
    ((fn, ms) => {
      const id = setTimeout(fn, ms);
      return { cancel: () => clearTimeout(id) };
    });
  const createTopic =
    options.createTopic ?? ((baseName: string) => `${baseName}:${crypto.randomUUID()}`);

  let disposed = false;
  let generation = 0;
  let hasJoined = false;
  let retryAttempt = 0;
  let timer: { cancel: () => void } | null = null;
  let current: TChannel | null = null;

  const connect = () => {
    if (disposed) return;
    const generationAtConnect = ++generation;
    const raw = options.client.channel(createTopic(options.baseName));
    current = raw;
    let channel = asPostgresChannel(raw);
    for (const binding of options.bindings) {
      channel = channel.on('postgres_changes', binding.filter, (payload) => {
        if (disposed || generationAtConnect !== generation) return;
        binding.callback(payload as Parameters<PostgresChangeBinding['callback']>[0]);
      });
    }
    channel.subscribe((status) => {
      if (disposed || generationAtConnect !== generation) return;
      if (status === 'SUBSCRIBED') {
        timer?.cancel();
        timer = null;
        retryAttempt = 0;
        if (hasJoined) options.onResubscribed?.();
        hasJoined = true;
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        scheduleReconnect();
      }
    });
  };

  const scheduleReconnect = () => {
    if (disposed || timer) return;
    const wait = inboxChannelRetryDelay(retryAttempt);
    retryAttempt += 1;
    timer = schedule(() => {
      timer = null;
      if (disposed) return;
      generation += 1;
      const stale = current;
      current = null;
      if (stale) void options.client.removeChannel(stale);
      connect();
    }, wait);
  };

  connect();

  return () => {
    disposed = true;
    generation += 1;
    timer?.cancel();
    timer = null;
    const stale = current;
    current = null;
    if (stale) void options.client.removeChannel(stale);
  };
}

export function subscribeInboxConversations(options: {
  supabase: SupabaseClient;
  fetchAll: () => Promise<WhatsAppConversation[]>;
  mapRow: (row: InboxConversationRowLike) => WhatsAppConversation;
  callback: (conversations: WhatsAppConversation[]) => void;
  onError?: (error: Error) => void;
  filter: InboxListFilter;
  channelName: string;
  skipInitialLoad?: boolean;
  getSnapshot?: () => WhatsAppConversation[];
  onResubscribed?: () => void;
}): Unsubscribe {
  const { supabase, fetchAll, mapRow, callback, onError, filter, channelName } = options;
  let disposed = false;
  let cache: WhatsAppConversation[] = [];
  let uuidToStableKey = new Map<string, string>();

  const emit = (next: WhatsAppConversation[]) => {
    cache = next;
    callback(next);
  };

  const load = async () => {
    if (disposed) return;
    try {
      const rows = await fetchAll();
      uuidToStableKey = new Map(
        rows.filter((row) => row.rowId).map((row) => [row.rowId as string, row.id]),
      );
      emit(rows);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const coalescer = createInboxRealtimeCoalescer({
    onFlush: (events) => {
      if (disposed) return;
      let next = options.getSnapshot?.() ?? cache;
      let nextMap = uuidToStableKey;
      for (const event of events) {
        const applied = applyInboxRealtimeEvent(next, nextMap, event, filter, mapRow);
        next = applied.conversations;
        nextMap = applied.uuidToStableKey;
      }
      uuidToStableKey = nextMap;
      emit(next);
    },
  });

  if (!options.skipInitialLoad) {
    void load();
  }

  const stopChannel = openPostgresChannel({
    client: supabase,
    baseName: channelName,
    bindings: [
      {
        filter: { event: '*', schema: 'public', table: 'whatsapp_conversations' },
        callback: (payload) => {
          const eventType = payload.eventType;
          if (eventType !== 'INSERT' && eventType !== 'UPDATE' && eventType !== 'DELETE') return;
          const event: InboxRealtimeEvent = {
            eventType,
            new: (payload.new as InboxConversationRowLike | null) ?? null,
            old: (payload.old as InboxConversationRowLike | null) ?? null,
          };
          coalescer.push(event);
        },
      },
    ],
    onResubscribed: options.onResubscribed ?? (options.skipInitialLoad ? undefined : () => {
      void load();
    }),
  });

  return () => {
    disposed = true;
    coalescer.dispose();
    stopChannel();
  };
}

export function subscribeInboxMessages(options: {
  supabase: SupabaseClient;
  fetchAll: () => Promise<WhatsAppMessage[]>;
  mapRow: (row: Record<string, unknown>) => WhatsAppMessage;
  stableKey: string;
  callback: (messages: WhatsAppMessage[]) => void;
  onError?: (error: Error) => void;
}): Unsubscribe {
  const { supabase, fetchAll, mapRow, stableKey, callback, onError } = options;
  let disposed = false;
  let cache: WhatsAppMessage[] = [];

  const emit = (next: WhatsAppMessage[]) => {
    cache = next;
    callback(next);
  };

  const load = async () => {
    if (disposed) return;
    try {
      emit(await fetchAll());
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  void load();
  const stopChannel = openPostgresChannel({
    client: supabase,
    baseName: `whatsapp-messages:${stableKey}`,
    bindings: [
      {
        filter: {
          event: '*',
          schema: 'public',
          table: 'whatsapp_message_log',
          filter: `conversation_stable_key=eq.${stableKey}`,
        },
        callback: (payload) => {
          if (disposed) return;
          const eventType = payload.eventType;
          if (eventType !== 'INSERT' && eventType !== 'UPDATE' && eventType !== 'DELETE') return;
          const nextRow = payload.new;
          if (nextRow?.hidden_from_panel) {
            emit(applyInboxMessageEvent(cache, { eventType: 'DELETE', oldId: String(nextRow.id) }));
            return;
          }
          emit(
            applyInboxMessageEvent(cache, {
              eventType,
              new: nextRow ? mapRow(nextRow) : null,
              oldId: String(payload.old?.id ?? nextRow?.id ?? ''),
            }),
          );
        },
      },
    ],
    onResubscribed: () => {
      void load();
    },
  });

  return () => {
    disposed = true;
    stopChannel();
  };
}

export function subscribeInboxMessageInserts(options: {
  supabase: SupabaseClient;
  channelName: string;
  onInsert: (message: ConversationPreviewMessage) => void;
  onResubscribed?: () => void;
}): Unsubscribe {
  let disposed = false;
  const stopChannel = openPostgresChannel({
    client: options.supabase,
    baseName: options.channelName,
    bindings: [
      {
        filter: { event: 'INSERT', schema: 'public', table: 'whatsapp_message_log' },
        callback: (payload) => {
          if (disposed) return;
          const message = previewFromMessageInsert(payload.new ?? undefined);
          if (message) options.onInsert(message);
        },
      },
    ],
    onResubscribed: options.onResubscribed,
  });

  return () => {
    disposed = true;
    stopChannel();
  };
}
