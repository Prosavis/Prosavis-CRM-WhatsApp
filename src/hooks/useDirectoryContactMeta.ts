import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/config/supabase';
import { inboxQueryKeys } from '@/hooks/inboxQueryKeys';
import {
  createDirectoryChangeBatch,
  directoryPhoneFromChange,
  fetchDirectoryMetaByPhones,
  mergePhoneMeta,
  type DirectoryContactMeta,
  type DirectoryMetaSourceRow,
} from '@/utils/directoryContactMetaFetch';
import { directoryPhoneKey } from '@/utils/directoryPhone';
import { openPostgresChannel } from '@/utils/inboxRealtimeSync';
import { normalizeWhatsAppPanelPhone } from '@/utils/whatsappPhone';
import type { WhatsAppConversation } from '@/services/whatsappService';

export type { DirectoryContactMeta };

export interface DirectoryContactMetaResult {
  metaByPhoneKey: Map<string, DirectoryContactMeta>;
  /** False hasta que el fetch del directorio termina (éxito o error). */
  ready: boolean;
}

function conversationPhone(conv: WhatsAppConversation): string | null {
  return normalizeWhatsAppPanelPhone(
    conv.phone ?? conv.contactPhone ?? conv.id,
  );
}

function buildLookupKeys(conversations: WhatsAppConversation[]): string[] {
  const keys = new Set<string>();
  for (const conv of conversations) {
    const key = directoryPhoneKey(conversationPhone(conv));
    if (key) keys.add(key);
  }
  return [...keys].sort();
}

const directoryMetaRoot = ['inbox', 'directory-meta'] as const;

async function loadDirectoryMetaRows(phones: string[]): Promise<DirectoryMetaSourceRow[]> {
  const { data, error } = await supabase.rpc('crm_directory_meta_by_phones', {
    p_phones: phones,
  });
  if (error) throw error;
  return (data ?? []) as DirectoryMetaSourceRow[];
}

export function useDirectoryContactMeta(
  conversations: WhatsAppConversation[],
): DirectoryContactMetaResult {
  const queryClient = useQueryClient();
  const lookupSignature = useMemo(() => {
    return buildLookupKeys(conversations).join('|');
  }, [conversations]);

  const query = useQuery({
    queryKey: inboxQueryKeys.directoryMeta(lookupSignature),
    enabled: Boolean(lookupSignature),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const keys = lookupSignature.split('|').filter(Boolean);
      return fetchDirectoryMetaByPhones(keys, loadDirectoryMetaRows);
    },
  });

  useEffect(() => {
    const batch = createDirectoryChangeBatch({
      onFlush: (change) => {
        if ('reloadAll' in change) {
          void queryClient.invalidateQueries({ queryKey: directoryMetaRoot });
          return;
        }
        void fetchDirectoryMetaByPhones(change.phones, loadDirectoryMetaRows)
          .then((loaded) => {
            queryClient.setQueriesData<Map<string, DirectoryContactMeta>>(
              { queryKey: directoryMetaRoot },
              (current) => (current ? mergePhoneMeta(current, change.phones, loaded) : current),
            );
          })
          .catch((error) => {
            console.error('Directory meta refresh failed:', error);
            void queryClient.invalidateQueries({ queryKey: directoryMetaRoot });
          });
      },
    });
    const stop = openPostgresChannel({
      client: supabase,
      baseName: 'crm-directory-inbox-meta',
      bindings: [
        {
          filter: { event: '*', schema: 'public', table: 'crm_directory' },
          callback: (payload) => {
            if (payload.eventType === 'DELETE') {
              batch.push(null);
              return;
            }
            batch.push(directoryPhoneFromChange(payload.new));
          },
        },
      ],
      onResubscribed: () => batch.push(null),
    });
    return () => {
      batch.dispose();
      stop();
    };
  }, [queryClient]);

  return {
    metaByPhoneKey: query.data ?? new Map<string, DirectoryContactMeta>(),
    ready: !lookupSignature || query.data != null || query.isError,
  };
}

export function getDirectoryMetaForConversation(
  conv: WhatsAppConversation,
  metaByPhoneKey: Map<string, DirectoryContactMeta>,
): DirectoryContactMeta | undefined {
  const phone = conversationPhone(conv);
  const key = directoryPhoneKey(phone);
  if (!key) return undefined;
  return metaByPhoneKey.get(key);
}
