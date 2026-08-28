import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { WhatsAppConversation, WhatsAppMessage } from '@/services/whatsappService';
import {
  applyInboxRealtimeEvent,
  createInboxRealtimeCoalescer,
  type InboxConversationRowLike,
  type InboxListFilter,
  type InboxRealtimeEvent,
} from '@/utils/inboxConversationCache';
import { applyInboxMessageEvent } from '@/utils/inboxMessageCache';

type Unsubscribe = () => void;

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
}): Unsubscribe {
  const { supabase, fetchAll, mapRow, callback, onError, filter, channelName } = options;
  let disposed = false;
  let channel: RealtimeChannel | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
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

  const scheduleRetry = () => {
    if (disposed || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void load();
    }, 2000);
  };

  if (!options.skipInitialLoad) {
    void load();
  }

  channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'whatsapp_conversations' },
      (payload) => {
        const eventType = payload.eventType;
        if (eventType !== 'INSERT' && eventType !== 'UPDATE' && eventType !== 'DELETE') return;
        const event: InboxRealtimeEvent = {
          eventType,
          new: (payload.new as InboxConversationRowLike | null) ?? null,
          old: (payload.old as InboxConversationRowLike | null) ?? null,
        };
        coalescer.push(event);
      },
    )
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        scheduleRetry();
      }
    });

  return () => {
    disposed = true;
    coalescer.dispose();
    if (retryTimer) clearTimeout(retryTimer);
    if (channel) void supabase.removeChannel(channel);
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
  let channel: RealtimeChannel | null = null;
  let cache: WhatsAppMessage[] = [];

  const emit = (next: WhatsAppMessage[]) => {
    cache = next;
    callback(next);
  };

  const load = async () => {
    try {
      emit(await fetchAll());
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  void load();
  channel = supabase
    .channel(`whatsapp-messages:${stableKey}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'whatsapp_message_log',
        filter: `conversation_stable_key=eq.${stableKey}`,
      },
      (payload) => {
        if (disposed) return;
        const eventType = payload.eventType;
        if (eventType !== 'INSERT' && eventType !== 'UPDATE' && eventType !== 'DELETE') return;
        const nextRow = payload.new as Record<string, unknown> | null;
        if (nextRow?.hidden_from_panel) {
          emit(applyInboxMessageEvent(cache, { eventType: 'DELETE', oldId: String(nextRow.id) }));
          return;
        }
        emit(
          applyInboxMessageEvent(cache, {
            eventType,
            new: nextRow ? mapRow(nextRow) : null,
            oldId: String((payload.old as { id?: string } | null)?.id ?? nextRow?.id ?? ''),
          }),
        );
      },
    )
    .subscribe();

  return () => {
    disposed = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
