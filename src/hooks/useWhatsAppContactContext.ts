import { useCallback, useEffect, useRef, useState } from 'react';
import { directoryService } from '@/services/directoryService';
import type { WhatsAppConversation } from '@/services/whatsappService';
import type { DirectoryEntry } from '@/types/lead';
import { pickContactPhotoUrl } from '@/utils/contactAvatar';
import { resolveContactDisplayName } from '@/utils/contactDisplayName';
import {
  directoryEntryMatchesConversation,
  isDialableConversationPhone,
} from '@/utils/directoryConversationMatch';
import { directoryPhonesMatch } from '@/utils/directoryPhone';

export interface ContactPanelUser {
  id: string;
  name?: string;
  displayName?: string;
  email?: string;
  photoURL?: string;
  photoUrl?: string;
  phoneNumber?: string;
  bio?: string;
  department?: string;
  city?: string;
  address?: string;
  isProvider?: boolean;
}

export interface WhatsAppContactContextValue {
  /** The directory entry (replaces `lead`). */
  directoryEntry: DirectoryEntry | null;
  /** @deprecated Use `directoryEntry` instead */
  lead: DirectoryEntry | null;
  user: ContactPanelUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  refetch: () => Promise<void>;
  displayName?: string;
  photoUrl?: string;
}

function userFromDirectoryEntry(entry: DirectoryEntry): ContactPanelUser {
  const meta = entry.metadata ?? {};
  const dName = entry.displayName ?? entry.fullName ?? undefined;
  return {
    id: String(entry.appUserId ?? entry.phone ?? entry.id),
    name: dName,
    displayName: dName,
    email: entry.email,
    photoURL: entry.photoUrl,
    photoUrl: entry.photoUrl,
    phoneNumber: entry.phone,
    bio: entry.notes ?? (meta.bio != null ? String(meta.bio) : undefined),
    department: meta.department != null ? String(meta.department) : undefined,
    city: meta.city != null ? String(meta.city) : undefined,
    address:
      entry.address ??
      (meta.address != null ? String(meta.address) : undefined),
    isProvider: Boolean(entry.providerId) || Boolean(meta.isProvider),
  };
}

/** @deprecated Prefer directoryPhonesMatch from @/utils/directoryPhone */
export function directoryEntryMatchesConversationPhone(
  entryPhone: string | null | undefined,
  conversationPhone: string | null | undefined,
): boolean {
  return directoryPhonesMatch(entryPhone, conversationPhone);
}

export function useWhatsAppContactContext(
  conversation: WhatsAppConversation | null | undefined,
): WhatsAppContactContextValue {
  const [directoryEntry, setDirectoryEntry] = useState<DirectoryEntry | null>(null);
  const [user, setUser] = useState<WhatsAppContactContextValue['user']>(null);
  const [loading, setLoading] = useState(false);
  const fetchGenRef = useRef(0);
  const conversationId = conversation?.id ?? null;

  // Clear stale directory identity immediately on chat switch (prevents cross-name writes).
  useEffect(() => {
    fetchGenRef.current += 1;
    setDirectoryEntry(null);
    setUser(null);
  }, [conversationId]);

  const refresh = useCallback(async () => {
    if (!conversation) {
      setDirectoryEntry(null);
      setUser(null);
      return;
    }

    const gen = ++fetchGenRef.current;
    setLoading(true);
    try {
      const phoneRaw = conversation.phone ?? conversation.contactPhone ?? null;
      let entry: DirectoryEntry | null = null;
      if (isDialableConversationPhone(phoneRaw)) {
        const found = await directoryService.findByPhone(phoneRaw);
        entry = found[0] ?? null;
      }
      if (!entry && conversation.id) {
        entry = await directoryService.findByConversation(conversation.id);
      }

      if (gen !== fetchGenRef.current) return;

      if (!entry || !directoryEntryMatchesConversation(entry, conversation)) {
        setDirectoryEntry(null);
        setUser(null);
        return;
      }

      setDirectoryEntry(entry);
      setUser(userFromDirectoryEntry(entry));
    } finally {
      if (gen === fetchGenRef.current) {
        setLoading(false);
      }
    }
  }, [conversation]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const matchedDirectory =
    directoryEntry && directoryEntryMatchesConversation(directoryEntry, conversation ?? {})
      ? directoryEntry
      : null;

  const displayName = resolveContactDisplayName({
    directoryDisplayName: matchedDirectory?.displayName,
    directoryFullName: matchedDirectory?.fullName,
    contactName: conversation?.contactName,
    whatsappProfileName: conversation?.whatsappProfileName,
    phone: conversation?.contactPhone ?? conversation?.phone,
    conversationId: conversation?.id,
    contactNameLocked: conversation?.contactNameLocked,
  });

  const photoUrl = pickContactPhotoUrl(
    matchedDirectory ? user?.photoUrl ?? user?.photoURL : undefined,
    conversation?.contactPhotoUrl,
  );

  return {
    directoryEntry: matchedDirectory,
    lead: matchedDirectory, // backward compat
    user: matchedDirectory ? user : null,
    loading,
    refresh,
    refetch: refresh,
    displayName,
    photoUrl,
  };
}
