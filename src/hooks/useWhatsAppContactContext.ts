import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/config/supabase';
import type { WhatsAppConversation } from '@/services/whatsappService';
import type { Lead } from '@/types/lead';
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
  lead: Lead | null;
  user: ContactPanelUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  refetch: () => Promise<void>;
  displayName?: string;
  photoUrl?: string;
}

function mapLeadRow(row: Record<string, unknown>): Lead {
  return {
    id: String(row.id),
    phone: row.phone != null ? String(row.phone) : undefined,
    email: row.email != null ? String(row.email) : undefined,
    name: row.name != null ? String(row.name) : undefined,
    address: row.address != null ? String(row.address) : undefined,
    notes: row.notes != null ? String(row.notes) : undefined,
    userId: row.user_id != null ? String(row.user_id) : undefined,
    channels: (row.channels as Lead['channels']) ?? [],
    status: row.status as Lead['status'],
    source: row.source as Lead['source'],
    mensajes_enviados: Number(row.mensajes_enviados ?? 0),
    secuencia_activa: row.secuencia_activa as Lead['secuencia_activa'],
    secuencia_paso: Number(row.secuencia_paso ?? 0),
    opt_out: Boolean(row.opt_out),
    last_response_text:
      row.last_response_text != null ? String(row.last_response_text) : undefined,
    appointmentId: row.appointment_id != null ? String(row.appointment_id) : undefined,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at)),
  };
}

export function useWhatsAppContactContext(
  conversation: WhatsAppConversation | null | undefined,
): WhatsAppContactContextValue {
  const [lead, setLead] = useState<Lead | null>(null);
  const [user, setUser] = useState<WhatsAppContactContextValue['user']>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!conversation) {
      setLead(null);
      setUser(null);
      return;
    }

    setLoading(true);
    try {
      const phone = normalizeWhatsAppPanelPhone(
        conversation.phone ?? conversation.contactPhone ?? conversation.id,
      );

      if (phone) {
        const { data: leadRow } = await supabase
          .from('crm_leads')
          .select('*')
          .eq('phone', phone)
          .maybeSingle();
        setLead(leadRow ? mapLeadRow(leadRow) : null);

        const { data: profile } = await supabase
          .from('crm_contact_profiles')
          .select('*')
          .eq('phone', phone)
          .maybeSingle();

        if (profile) {
          const meta = (profile.metadata ?? {}) as Record<string, unknown>;
          const displayName = profile.display_name ?? undefined;
          setUser({
            id: String(profile.user_id ?? profile.phone ?? phone),
            name: displayName,
            displayName,
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
        setLead(null);
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
    lead,
    user,
    loading,
    refresh,
    refetch: refresh,
    displayName,
    photoUrl,
  };
}
