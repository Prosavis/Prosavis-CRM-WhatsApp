import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import { normalizePhone } from '../_shared/whatsappIdentity.ts';

function resolveTemplateBody(
  body: string,
  values: Record<string, string>,
): { body: string; unresolvedVariables: string[] } {
  const unresolved: string[] = [];
  const resolved = body.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    const trimmed = key.trim();
    const value = values[trimmed];
    if (value == null || value === '') {
      unresolved.push(trimmed);
      return `{{${trimmed}}}`;
    }
    return value;
  });
  return { body: resolved, unresolvedVariables: unresolved };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const templateId = String(body.templateId ?? '').trim();
    const recipientPhone = String(body.recipientPhone ?? '').trim();
    const customValues = (body.customValues ?? {}) as Record<string, string>;

    if (!templateId || !recipientPhone) {
      return jsonResponse({ error: 'Se requieren templateId y recipientPhone.' }, 400);
    }

    const { data: template, error: templateError } = await supabase
      .from('whatsapp_ia_templates')
      .select('body')
      .eq('id', templateId)
      .eq('archived', false)
      .single();
    if (templateError) throw templateError;

    const phone = normalizePhone(recipientPhone);
    const { data: conversation } = await supabase
      .from('whatsapp_conversations')
      .select('contact_name,whatsapp_profile_name')
      .eq('stable_key', phone)
      .maybeSingle();

    const contactName = conversation?.contact_name || conversation?.whatsapp_profile_name || undefined;
    const values: Record<string, string> = {
      nombre: contactName ?? customValues.nombre ?? '',
      telefono: phone,
      ...customValues,
    };

    const resolved = resolveTemplateBody(String(template.body), values);
    return jsonResponse({
      body: resolved.body,
      ...(contactName ? { contactName } : {}),
      unresolvedVariables: resolved.unresolvedVariables,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
