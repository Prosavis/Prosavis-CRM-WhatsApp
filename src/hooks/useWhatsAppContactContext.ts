import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/config/supabase';
import type { WhatsAppConversation } from '@/services/whatsappService';
import type { DirectoryEntry } from '@/types/lead';
import { directoryPhoneLookupVariants } from '@/utils/directoryPhone';
import { normalizeWhatsAppPanelPhone } from '@/utils/whatsappPhone';

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

function mapDirectoryRow(row: Record<string, unknown>): DirectoryEntry {
  return {
    id: String(row.id),
    fullName: row.full_name != null ? String(row.full_name) : '',
    displayName: row.display_name != null ? String(row.display_name) : undefined,
    email: row.email != null ? String(row.email) : undefined,
    phone: row.phone != null ? String(row.phone) : undefined,
    photoUrl: row.photo_url != null ? String(row.photo_url) : undefined,
    address: row.address != null ? String(row.address) : undefined,
    notes: row.notes != null ? String(row.notes) : undefined,
    appUserId: row.app_user_id != null ? String(row.app_user_id) : undefined,
    isAppUser: Boolean(row.is_app_user),
    providerId: row.provider_id != null ? String(row.provider_id) : undefined,
    serviceId: row.service_id != null ? String(row.service_id) : undefined,
    classification: (row.classification as DirectoryEntry['classification']) ?? 'unknown',
    qualityTag: (row.quality_tag as DirectoryEntry['qualityTag']) ?? 'standard',
    status: (row.status as string) ?? 'active',
    source: row.source != null ? String(row.source) : undefined,
    channels: (row.channels as DirectoryEntry['channels']) ?? [],
    paymentStatus: row.payment_status != null ? String(row.payment_status) : undefined,
    pendingAmount: Number(row.pending_amount ?? 0),
    pendingAppointmentsCount: Number(row.pending_appointments_count ?? 0),
    lastChargedAmount: row.last_charged_amount != null ? Number(row.last_charged_amount) : undefined,
    otpRequired: Boolean(row.otp_required),
    preferredServiceAddressLine: row.preferred_service_address_line != null ? String(row.preferred_service_address_line) : undefined,
    preferredServiceAddressRef: row.preferred_service_address_ref != null ? String(row.preferred_service_address_ref) : undefined,
    firstContactAt: row.first_contact_at != null ? String(row.first_contact_at) : undefined,
    lastContactAt: row.last_contact_at != null ? String(row.last_contact_at) : undefined,
    messagesCount: Number(row.messages_count ?? 0),
    activeSequence: (row.active_sequence as string) ?? 'NINGUNA',
    sequenceStep: Number(row.sequence_step ?? 0),
    optOut: Boolean(row.opt_out),
    lastResponseText: row.last_response_text != null ? String(row.last_response_text) : undefined,
    lastResponseAt: row.last_response_at != null ? String(row.last_response_at) : undefined,
    lastWhatsAppMessageAt: row.last_whatsapp_message_at != null ? String(row.last_whatsapp_message_at) : undefined,
    lastWhatsAppMessageText: row.last_whatsapp_message_text != null ? String(row.last_whatsapp_message_text) : undefined,
    lastWhatsAppIntent: row.last_whatsapp_intent != null ? String(row.last_whatsapp_intent) : undefined,
    unreadWhatsAppCount: Number(row.unread_whatsapp_count ?? 0),
    whatsAppAssignedTo: row.whatsapp_assigned_to != null ? String(row.whatsapp_assigned_to) : undefined,
    whatsAppConversationId: row.whatsapp_conversation_id != null ? String(row.whatsapp_conversation_id) : undefined,
    appointmentId: row.appointment_id != null ? String(row.appointment_id) : undefined,
    internalNotes: row.internal_notes != null ? String(row.internal_notes) : undefined,
    tags: (row.tags as string[]) ?? [],
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastSyncedAt: row.last_synced_at != null ? String(row.last_synced_at) : undefined,
  };
}

export function useWhatsAppContactContext(
  conversation: WhatsAppConversation | null | undefined,
): WhatsAppContactContextValue {
  const [directoryEntry, setDirectoryEntry] = useState<DirectoryEntry | null>(null);
  const [user, setUser] = useState<WhatsAppContactContextValue['user']>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!conversation) {
      setDirectoryEntry(null);
      setUser(null);
      return;
    }

    setLoading(true);
    try {
      const phone = normalizeWhatsAppPanelPhone(
        conversation.phone ?? conversation.contactPhone ?? conversation.id,
      );

      if (phone) {
        const phoneVariants = directoryPhoneLookupVariants(phone);
        const lookupPhones =
          phoneVariants.length > 0 ? phoneVariants : [phone];

        const { data: dirRows } = await supabase
          .from('crm_directory')
          .select('*')
          .in('phone', lookupPhones)
          .order('updated_at', { ascending: false })
          .limit(5);
        const dirRow = dirRows?.[0] ?? null;
        setDirectoryEntry(dirRow ? mapDirectoryRow(dirRow) : null);

        const { data: profileRows } = await supabase
          .from('crm_contact_profiles')
          .select('*')
          .in('phone', lookupPhones)
          .order('updated_at', { ascending: false })
          .limit(1);
        const profile = profileRows?.[0] ?? null;

        if (profile) {
          const meta = (profile.metadata ?? {}) as Record<string, unknown>;
          const dName = profile.display_name ?? undefined;
          setUser({
            id: String(profile.user_id ?? profile.phone ?? phone),
            name: dName,
            displayName: dName,
            email: profile.email ?? undefined,
            photoURL: profile.photo_url ?? undefined,
            photoUrl: profile.photo_url ?? undefined,
            phoneNumber: profile.phone ?? phone,
            bio: profile.notes ?? undefined,
            department: meta.department != null ? String(meta.department) : undefined,
            city: meta.city != null ? String(meta.city) : undefined,
            address: profile.notes ?? (meta.address != null ? String(meta.address) : undefined),
            isProvider: Boolean(meta.isProvider),
          });
        } else {
          setUser(null);
        }
      } else {
        setDirectoryEntry(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [conversation]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const displayName =
    conversation?.contactName ??
    conversation?.whatsappProfileName ??
    user?.displayName ??
    user?.name;
  const photoUrl = conversation?.contactPhotoUrl ?? user?.photoUrl ?? user?.photoURL;

  return {
    directoryEntry,
    lead: directoryEntry, // backward compat
    user,
    loading,
    refresh,
    refetch: refresh,
    displayName,
    photoUrl,
  };
}
