import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/errors.ts';

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? ''));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));

    const presetLabel = String(body.presetLabel ?? '').trim();
    const templateName = String(body.templateName ?? '').trim();
    const templateLanguage = String(body.templateLanguage ?? 'es_CO').trim();

    if (!presetLabel || !templateName || !templateLanguage) {
      return jsonResponse({ error: 'Se requieren presetLabel, templateName y templateLanguage.' }, 400);
    }

    const headerValues = normalizeStringArray(body.headerValues);
    const bodyValues = normalizeStringArray(body.bodyValues);
    const sectionKey =
      typeof body.sectionKey === 'string' && body.sectionKey.trim()
        ? body.sectionKey.trim()
        : null;
    const isFavorite = body.isFavorite !== false;
    const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;

    const { data, error } = await supabase
      .from('whatsapp_template_presets')
      .insert({
        preset_label: presetLabel,
        template_name: templateName,
        template_language: templateLanguage,
        header_values: headerValues,
        body_values: bodyValues,
        section_key: sectionKey,
        is_favorite: isFavorite,
        sort_order: sortOrder,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (error) throw error;

    return jsonResponse({ success: true, id: data.id });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
