import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  refetchConversations,
  subscribeToConversations,
  type FetchConversationsOptions,
  type WhatsAppConversation,
} from '@/services/whatsappService';
import { shouldRefetchOnVisibility } from '@/utils/inboxConversationCache';
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

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const rows = await refetchConversations(phoneNumberId, options);
      lastFullFetchAtRef.current = Date.now();
      return rows;
    },
    enabled,
    staleTime: 30_000,
    structuralSharing: true,
  });

  useEffect(() => {
    if (!enabled) return;
    return subscribeToConversations(
      (conversations) => {
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
      },
    );
  }, [enabled, options, phoneNumberId, queryClient, queryKey]);

  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (!shouldRefetchOnVisibility(lastFullFetchAtRef.current, Date.now())) return;
      void query.refetch();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled, query]);

  return {
    conversations: query.data ?? [],
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error : null,
    refetch: query.refetch,
    queryKey,
  };
}
