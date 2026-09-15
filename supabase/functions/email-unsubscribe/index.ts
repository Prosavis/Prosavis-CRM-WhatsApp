/**
 * One-click / link de baja del lote comercial@. Público (token HMAC).
 * No saca gente del pool salvo el correo que pidió BAJA.
 */
import { corsHeaders } from '../_shared/cors.ts';
import {
  applyEmailUnsubscribe,
  verifyUnsubscribeToken,
} from '../_shared/emailUnsubscribe.ts';
import { getServiceClient } from '../_shared/supabase.ts';

function htmlPage(title: string, body: string, status = 200): Response {
  const html =
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${title}</title></head>` +
    `<body style="font-family:Arial,Helvetica,sans-serif;color:#002446;padding:32px 20px;">` +
    `<p style="font-weight:900;letter-spacing:4px;color:#FF7700;">PROSAVIS</p>` +
    `<p>${body}</p></body></html>`;
  return new Response(html, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function tokenFromRequest(req: Request): string {
  const url = new URL(req.url);
  return (url.searchParams.get('t') || url.searchParams.get('token') || '').trim();
}

function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'GET' && req.method !== 'POST') {
    return htmlPage('Método no permitido', 'Use el enlace de baja del correo.', 405);
  }

  const secret = (Deno.env.get('EMAIL_UNSUBSCRIBE_SECRET') ?? '').trim();
  const token = tokenFromRequest(req);
  const email = secret ? await verifyUnsubscribeToken(token, secret) : null;
  if (!email) {
    return htmlPage(
      'Enlace no válido',
      'Este enlace de baja no es válido. Puede responder BAJA a comercial@prosavis.com.',
      200,
    );
  }

  try {
    const supabase = getServiceClient();
    const pattern = escapeIlike(email);
    await applyEmailUnsubscribe(
      {
        async markDirectoryOptOut() {
          const { data, error } = await supabase
            .from('crm_directory')
            .select('id,tags,opt_out')
            .ilike('email', pattern);
          if (error) throw error;
          let count = 0;
          for (const row of data ?? []) {
            if (row.opt_out === true) {
              count += 1;
              continue;
            }
            const { error: updateError } = await supabase
              .from('crm_directory')
              .update({ opt_out: true, updated_at: new Date().toISOString() })
              .eq('id', row.id);
            if (updateError) throw updateError;
            count += 1;
          }
          return count;
        },
        async excludePendingOutreach(normalized) {
          const { data, error } = await supabase
            .from('outreach_leads')
            .update({
              email_status: 'excluded',
              exclude_reason: 'unsubscribe',
            })
            .eq('email_status', 'pending')
            .ilike('email', escapeIlike(normalized))
            .select('id');
          if (error) throw error;
          return data?.length ?? 0;
        },
      },
      email,
    );
  } catch (err) {
    console.error('[email-unsubscribe]', err);
    return htmlPage(
      'Baja registrada',
      'Si el enlace era válido, ya no le enviaremos más correos comerciales.',
      200,
    );
  }

  return htmlPage(
    'Baja confirmada',
    'Ya no le enviaremos más correos comerciales de Prosavis.',
    200,
  );
});
