import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getServiceClient } from '../_shared/supabase.ts';

const encoder = new TextEncoder();

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }

  return diff === 0;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verifyMetaSignature(rawBody: string, signature: string | null): Promise<boolean> {
  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET');
  if (!appSecret) return true;
  if (!signature?.startsWith('sha256=')) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));

  return timingSafeEqual(`sha256=${toHex(digest)}`, signature);
}

function getEventType(payload: Record<string, unknown>): string {
  const entry = Array.isArray(payload.entry) ? payload.entry[0] : null;
  const changes = entry && typeof entry === 'object' && 'changes' in entry
    ? (entry as { changes?: unknown }).changes
    : null;
  const firstChange = Array.isArray(changes) ? changes[0] : null;

  if (firstChange && typeof firstChange === 'object' && 'field' in firstChange) {
    return String((firstChange as { field?: unknown }).field ?? 'unknown');
  }

  return 'unknown';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const expectedToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN');

    if (mode === 'subscribe' && expectedToken && token === expectedToken && challenge) {
      return new Response(challenge, { headers: corsHeaders });
    }

    return jsonResponse({ error: 'Token de verificacion invalido.' }, 403);
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metodo no permitido.' }, 405);
  }

  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-hub-signature-256');
    const verified = await verifyMetaSignature(rawBody, signature);
    const payload = JSON.parse(rawBody || '{}') as Record<string, unknown>;
    const processingMode = Deno.env.get('WHATSAPP_WEBHOOK_MODE') === 'active' ? 'active' : 'shadow';
    const supabase = getServiceClient();

    const { error } = await supabase.from('whatsapp_webhook_events').insert({
      event_type: getEventType(payload),
      payload,
      signature,
      verified,
      processing_mode: processingMode,
      processed: false,
      error_message: verified ? null : 'Firma Meta invalida.',
    });

    if (error) throw error;
    if (!verified) return jsonResponse({ error: 'Firma Meta invalida.' }, 401);

    return jsonResponse({ ok: true, mode: processingMode });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
});
