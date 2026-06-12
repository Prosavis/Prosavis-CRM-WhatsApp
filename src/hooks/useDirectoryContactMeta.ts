import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/config/supabase';
import {
  directoryPhoneKey,
  directoryPhoneLookupVariants,
} from '@/utils/directoryPhone';
import { normalizeWhatsAppPanelPhone } from '@/utils/whatsappPhone';
import type { WhatsAppConversation } from '@/services/whatsappService';

export interface DirectoryContactMeta {
  photoUrl?: string;
  displayName?: string;
}

const CHUNK_SIZE = 80;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function conversationPhone(conv: WhatsAppConversation): string | null {
  return normalizeWhatsAppPanelPhone(
    conv.phone ?? conv.contactPhone ?? conv.id,
  );
}

function buildLookupVariants(conversations: WhatsAppConversation[]): string[] {
  const variantSet = new Set<string>();
  for (const conv of conversations) {
    const phone = conversationPhone(conv);
    if (!phone) continue;
    for (const variant of directoryPhoneLookupVariants(phone)) {
      variantSet.add(variant);
    }
  }
  return [...variantSet].sort();
}

export function useDirectoryContactMeta(
  conversations: WhatsAppConversation[],
): Map<string, DirectoryContactMeta> {
  const lookupSignature = useMemo(() => {
    return buildLookupVariants(conversations).join('|');
  }, [conversations]);

  const [metaByPhoneKey, setMetaByPhoneKey] = useState<
    Map<string, DirectoryContactMeta>
  >(() => new Map());

  useEffect(() => {
    if (!lookupSignature) {
      setMetaByPhoneKey(new Map());
      return;
    }

    const variants = lookupSignature.split('|');
    let cancelled = false;

    const load = async () => {
      const rows: Array<{
        phone: string | null;
        phone_key: string | null;
        photo_url: string | null;
        display_name: string | null;
        full_name: string | null;
      }> = [];

      for (const chunk of chunkArray(variants, CHUNK_SIZE)) {
        const { data, error } = await supabase
          .from('crm_directory')
          .select('phone, phone_key, photo_url, display_name, full_name')
          .in('phone', chunk);

        if (error) throw error;
        if (data) rows.push(...data);
      }

      const next = new Map<string, DirectoryContactMeta>();

      for (const row of rows) {
        const key =
          row.phone_key?.trim() ||
          directoryPhoneKey(row.phone) ||
          null;
        if (!key) continue;

        const displayName =
          row.display_name?.trim() ||
          row.full_name?.trim() ||
          undefined;
        const photoUrl = row.photo_url?.trim() || undefined;
        const existing = next.get(key);

        if (!existing) {
          next.set(key, { displayName, photoUrl });
          continue;
        }

        next.set(key, {
          displayName: existing.displayName || displayName,
          photoUrl: existing.photoUrl || photoUrl,
        });
      }

      if (!cancelled) setMetaByPhoneKey(next);
    };

    void load().catch(() => {
      if (!cancelled) setMetaByPhoneKey(new Map());
    });

    return () => {
      cancelled = true;
    };
  }, [lookupSignature]);

  return metaByPhoneKey;
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
