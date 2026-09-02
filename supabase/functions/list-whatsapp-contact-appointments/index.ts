import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/errors.ts';
import { loadAppointmentsForContact } from '../_shared/inboxAiContext.ts';
import { loadDirectoryByPhone } from '../_shared/inboxAiKnowledge.ts';
import { customerPhoneFromStableKey } from '../_shared/whatsappLines.ts';
import { normalizePhone } from '../_shared/whatsappIdentity.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const stableKey = String(body.stableKey ?? '').trim();
    if (!stableKey) return jsonResponse({ error: 'Se requiere stableKey.' }, 400);

    const phone = normalizePhone(customerPhoneFromStableKey(stableKey));
    let directoryId: string | null = null;
    let appUserId: string | null = null;
    try {
      const directory = await loadDirectoryByPhone(supabase, phone);
      directoryId = directory?.id ?? null;
      appUserId = directory?.appUserId ?? null;
    } catch (err) {
      console.warn(
        JSON.stringify({
          scope: 'list-whatsapp-contact-appointments',
          event: 'directory-lookup-failed',
          error: String((err as Error)?.message ?? err),
        }),
      );
    }

    const loaded = await loadAppointmentsForContact({
      phone,
      directoryId,
      appUserId,
    });

    return jsonResponse({
      appointments: loaded.appointments,
      appointmentsLoadFailed: loaded.appointmentsLoadFailed === true,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
