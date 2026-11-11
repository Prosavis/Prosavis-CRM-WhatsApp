import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchConversationsUpdatedSince,
  refetchConversations,
  subscribeToConversations,
  subscribeToMessageInserts,
  type FetchConversationsOptions,
  type WhatsAppConversation,
} from '@/services/whatsappService';
import {
  applyServerConversationRows,
  inboxCatchupSince,
  maxConversationUpdatedAt,
  mergeNewerConversationPreviews,
  patchConversationPreview,
  shouldRefetchOnVisibility,
} from '@/utils/inboxConversationCache';
import { markInboxPerf, INBOX_PERF_MARKS } from '@/utils/inboxPerfMarks';
import { inboxQueryKeys } from '@/hooks/inboxQueryKeys';

export function useInboxConversations(
  phoneNumberId: string | undefined,
  options: FetchConversationsOptions | undefined,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => inboxQueryKeys.conversations(phoneNumberId, options),
    [phoneNumberId, options],
  );
  const lastFullFetchAtRef = useRef<number | null>(null);
  const markedReadyRef = useRef(false);
  const serverCursorRef = useRef<number | null>(null);
  const catchupInFlightRef = useRef(false);
  const catchupAgainRef = useRef(false);

  const bumpCursor = (rows: WhatsAppConversation[]) => {
    const max = maxConversationUpdatedAt(rows);
    if (max != null && (serverCursorRef.current == null || max > serverCursorRef.current)) {
      serverCursorRef.current = max;
    }
  };

  const scopeRef = useRef({ enabled, phoneNumberId, options, queryClient, queryKey });
  const catchUpRef = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => {
    scopeRef.current = { enabled, phoneNumberId, options, queryClient, queryKey };
    catchUpRef.current = async () => {
      const scope = scopeRef.current;
      if (!scope.enabled) return;
      if (catchupInFlightRef.current) {
        catchupAgainRef.current = true;
        return;
      }
      catchupInFlightRef.current = true;
      try {
        do {
          catchupAgainRef.current = false;
          const since = inboxCatchupSince(serverCursorRef.current);
          const rows = await fetchConversationsUpdatedSince(since);
          bumpCursor(rows);
          scope.queryClient.setQueryData<WhatsAppConversation[]>(scope.queryKey, (current) =>
            applyServerConversationRows(current ?? [], rows, {
              phoneNumberId: scope.phoneNumberId,
              includeOrphans: scope.options?.includeOrphans,
            }),
          );
        } while (catchupAgainRef.current);
      } catch (error) {
        console.error('Inbox catch-up failed:', error);
      } finally {
        catchupInFlightRef.current = false;
      }
    };
  });

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const rows = await refetchConversations(phoneNumberId, options);
      lastFullFetchAtRef.current = Date.now();
      bumpCursor(rows);
      const local = queryClient.getQueryData<WhatsAppConversation[]>(queryKey) ?? [];
      return mergeNewerConversationPreviews(rows, local);
    },
    enabled,
    staleTime: 30_000,
    structuralSharing: true,
  });

  useEffect(() => {
    if (!enabled) return;
    return subscribeToConversations(
      (conversations) => {
        bumpCursor(conversations);
        queryClient.setQueryData<WhatsAppConversation[]>(queryKey, conversations);
        if (!markedReadyRef.current) {
          markedReadyRef.current = true;
          markInboxPerf(INBOX_PERF_MARKS.listReady);
        }
      },
      phoneNumberId,
      undefined,
      {
        ...options,
        skipInitialLoad: true,
        getSnapshot: () => queryClient.getQueryData<WhatsAppConversation[]>(queryKey) ?? [],
        onResubscribed: () => {
          void catchUpRef.current();
        },
      },
    );
  }, [enabled, options, phoneNumberId, queryClient, queryKey]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeToMessageInserts(
      (message) => {
        queryClient.setQueryData<WhatsAppConversation[]>(queryKey, (current) =>
          current ? patchConversationPreview(current, message) : current,
        );
      },
      `whatsapp-message-inserts:${queryKey.join(':')}`,
      () => {
        void catchUpRef.current();
      },
    );
  }, [enabled, phoneNumberId, queryClient, queryKey]);

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      // ponytail: sin intervalo. Si la barra se atrasa con la pestaña visible y el canal unido, agregar 60s y un índice en updated_at.
      void catchUpRef.current();
      if (!shouldRefetchOnVisibility(lastFullFetchAtRef.current, Date.now())) return;
      void query.refetch();
    };
    const onOnline = () => {
      void catchUpRef.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [enabled, query]);

  return {
    conversations: query.data ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    refetch: query.refetch,
    queryKey,
  };
}
