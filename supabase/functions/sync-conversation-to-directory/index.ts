import { corsHeaders } from '../_shared/cors.ts';
import {
  directoryPhoneKey,
  directoryPhoneLookupVariants,
  normalizeDirectoryPhoneE164,
} from '../_shared/directoryPhone.ts';
import { getServiceClient } from '../_shared/supabase.ts';

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE';
  table: string;
  record: Record<string, unknown>;
}

interface ConversationRecord {
  id?: string;
  stable_key?: string;
  phone?: string;
  contact_name?: string;
  contact_phone?: string;
  contact_photo_url?: string;
  whatsapp_profile_name?: string;
  assigned_to?: string;
  last_message_text?: string;
  last_message_at?: string;
  last_message_direction?: string;
  last_intent?: string;
  unread_count?: number;
  state?: string;
  is_archived?: boolean;
}

function safeString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function safeInt(value: unknown): number | null {
  if (typeof value === 'number') return Math.max(0, Math.floor(value));
  if (typeof value === 'string') {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }
  return null;
}

function isUsableDirectoryName(name: string | null): boolean {
  if (!name || name.trim().length < 2) return false;
  if (!/\p{L}/u.test(name)) return false;
  return !/\p{Extended_Pictographic}/u.test(name);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload: WebhookPayload = await req.json();

    if (payload.table !== 'whatsapp_conversations') {
      return new Response(JSON.stringify({ error: 'Solo soportamos whatsapp_conversations.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!payload.record) {
      return new Response(JSON.stringify({ error: 'Falta record en el payload.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const record = payload.record as ConversationRecord;
    const supabase = getServiceClient();

    // --- Resolver phone (E.164 canónico) ---
    const rawPhone = safeString(record.contact_phone) || safeString(record.phone);
    if (!rawPhone) {
      return new Response(JSON.stringify({ error: 'Falta phone/contact_phone en el record.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const phone = normalizeDirectoryPhoneE164(rawPhone) ?? rawPhone;

    // --- Construir display_name y full_name ---
    const waProfileName = safeString(record.whatsapp_profile_name);
    const contactName = safeString(record.contact_name);
    const displayName = waProfileName || contactName;

    // --- Determinar si la conversación está activa ---
    const isActive = record.state === 'active';

    // --- Buscar entry existente (phone_key canónico, luego variantes legacy) ---
    const phoneKey = directoryPhoneKey(rawPhone);
    let existingEntry: Record<string, unknown> | null = null;

    if (phoneKey) {
      const { data: byKey } = await supabase
        .from('crm_directory')
        .select('id, display_name, full_name, photo_url, unread_whatsapp_count, opt_out, status')
        .eq('phone_key', phoneKey)
        .limit(1);
      existingEntry = byKey?.[0] ?? null;
    }

    if (!existingEntry) {
      const phoneVariants = directoryPhoneLookupVariants(rawPhone);
      const { data: byPhone } = await supabase
        .from('crm_directory')
        .select('id, display_name, full_name, photo_url, unread_whatsapp_count, opt_out, status')
        .in('phone', phoneVariants.length > 0 ? phoneVariants : [phone])
        .limit(1);
      existingEntry = byPhone?.[0] ?? null;
    }

    // --- Construir el JSONB para upsert_directory_entry ---
    // phone ya está normalizado a E.164 (línea 92: normalizeDirectoryPhoneE164)
    const entry: Record<string, unknown> = {
      full_name: displayName || phone,
      display_name: displayName,
      phone,
      photo_url: safeString(record.contact_photo_url),
      last_whatsapp_message_at: safeString(record.last_message_at),
      last_whatsapp_message_text: safeString(record.last_message_text),
      last_whatsapp_intent: safeString(record.last_intent),
      whatsapp_conversation_id: safeString(record.id) || safeString(record.stable_key),
      channels: ['WHATSAPP'],
    };

    // --- WhatsApp assigned_to ---
    // Always sync assigned_to: set to uuid or null
    const assignedTo = safeString(record.assigned_to);
    entry.whatsapp_assigned_to = assignedTo;

    // --- Unread count logic ---
    if (isActive) {
      const currentUnread = safeInt(record.unread_count) ?? 0;
      const existingUnread = existingEntry?.unread_whatsapp_count ?? 0;
      entry.unread_whatsapp_count = Math.max(currentUnread, existingUnread);
    } else {
      entry.unread_whatsapp_count = 0;
    }

    // --- Si existe entry, usar el mejor display_name/photo_url ---
    // Prioridad: existing record > WhatsApp data
    if (existingEntry) {
      const existingFullName = safeString(existingEntry.full_name as string | undefined);
      if (isUsableDirectoryName(existingFullName)) {
        delete entry.full_name;
      } else if (displayName && existingFullName && existingFullName !== displayName) {
        if (existingFullName.length > 3 && !/^\d+$/.test(existingFullName)) {
          delete entry.full_name;
        }
      }

      if (!displayName && existingEntry.display_name) {
        // No sobreescribir display_name existente con null
        delete entry.display_name;
      } else if (displayName && existingEntry.display_name && existingEntry.display_name !== displayName) {
        // Si el entry existente ya tiene un display_name mejor (no es un phone),
        // y el nuevo displayName tampoco se ve como teléfono, conservamos el existente
        if (existingEntry.display_name.length > 3 && !existingEntry.display_name.match(/^\d+$/)) {
          delete entry.display_name;
        }
      }

      if (existingEntry.photo_url && !safeString(record.contact_photo_url)) {
        delete entry.photo_url;
      }
    }

    // --- Source tracking ---
    // Siempre incluimos 'WHATSAPP' como source (se mergea via función upsert)
    entry.source = 'WHATSAPP';

    // --- Status logic ---
    // Prioridad: archived → inactive, opt_out → opt_out, active conversation → active
    const isOptOut =
      existingEntry?.opt_out === true || existingEntry?.status === 'opt_out';
    if (record.is_archived === true) {
      entry.status = 'inactive';
    } else if (!isOptOut) {
      entry.status = 'active';
    }

    // --- Ejecutar upsert_directory_entry via RPC ---
    const { data: upsertedId, error: upsertError } = await supabase.rpc(
      'upsert_directory_entry',
      { p_entry: entry },
    );

    if (upsertError) {
      console.error('[sync-conversation-to-directory] upsert_directory_entry falló:', upsertError);
      throw upsertError;
    }

    console.log('[sync-conversation-to-directory] Sincronizado', {
      phone,
      directory_id: upsertedId,
      type: payload.type,
    });

    return new Response(JSON.stringify({ ok: true, directory_id: upsertedId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[sync-conversation-to-directory] Error:', String(error));
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
