import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/errors.ts';

function normalizeStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? ''));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const presetId = String(body.presetId ?? '').trim();
    if (!presetId) return jsonResponse({ error: 'Se requiere presetId.' }, 400);

    const patch: Record<string, unknown> = {};

    if (typeof body.presetLabel === 'string' && body.presetLabel.trim()) {
      patch.preset_label = body.presetLabel.trim();
    }
    if (typeof body.templateName === 'string' && body.templateName.trim()) {
      patch.template_name = body.templateName.trim();
    }
    if (typeof body.templateLanguage === 'string' && body.templateLanguage.trim()) {
      patch.template_language = body.templateLanguage.trim();
    }
    const headerValues = normalizeStringArray(body.headerValues);
    if (headerValues !== undefined) patch.header_values = headerValues;
    const bodyValues = normalizeStringArray(body.bodyValues);
    if (bodyValues !== undefined) patch.body_values = bodyValues;
    if (body.sectionKey === null) {
      patch.section_key = null;
    } else if (typeof body.sectionKey === 'string') {
      patch.section_key = body.sectionKey.trim() || null;
    }
    if (typeof body.isFavorite === 'boolean') patch.is_favorite = body.isFavorite;
    if (Number.isFinite(Number(body.sortOrder))) patch.sort_order = Number(body.sortOrder);

    if (!Object.keys(patch).length) {
      return jsonResponse({ error: 'No hay campos para actualizar.' }, 400);
    }

    const { error } = await supabase
      .from('whatsapp_template_presets')
      .update(patch)
      .eq('id', presetId);
    if (error) throw error;

    return jsonResponse({ success: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
