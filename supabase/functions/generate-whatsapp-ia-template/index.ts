import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireCrmAdmin } from '../_shared/supabase.ts';
import { formatError } from '../_shared/whatsappOutbound.ts';
import { geminiGenerateText } from '../_shared/geminiClient.ts';

function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{([^}]+)\}\}/g) ?? [];
  return [...new Set(matches.map((match) => match.replace(/[{}]/g, '').trim()))];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { supabase, user } = await requireCrmAdmin(req);
    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt ?? '').trim();
    if (!prompt) return jsonResponse({ error: 'Se requiere prompt.' }, 400);

    const apiKey = Deno.env.get('GEMINI_API_KEY')?.trim();
    if (!apiKey) return jsonResponse({ error: 'GEMINI_API_KEY no configurada.' }, 412);

    const generated = await geminiGenerateText({
      apiKey,
      systemInstruction:
        'Genera plantillas cortas de WhatsApp para Prosavis (servicios de limpieza en Colombia). ' +
        'Usa tono cordial y variables {{nombre}}, {{fecha}}, {{precio}} cuando aplique. Devuelve solo el texto.',
      userText: prompt,
      temperature: 0.5,
    });

    const label = prompt.slice(0, 60);
    const { data, error } = await supabase
      .from('whatsapp_ia_templates')
      .insert({
        name: label,
        body: generated,
        variables: extractVariables(generated),
        created_by: user.id,
        archived: false,
      })
      .select('id,name,body,variables')
      .single();
    if (error) throw error;

    return jsonResponse({
      success: true,
      id: data.id,
      template: {
        id: data.id,
        label: data.name,
        description: data.name,
        body: data.body,
        variables: Array.isArray(data.variables) ? data.variables : [],
        isDefault: false,
        generatedByAI: true,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonResponse({ error: formatError(error) }, 500);
  }
});
